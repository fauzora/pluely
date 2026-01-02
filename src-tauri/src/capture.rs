use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{ColorType, GenericImageView, ImageEncoder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::{thread, time::Duration};
use tauri::Emitter;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use xcap::Monitor;

/// Mendapatkan posisi mouse saat ini (Linux - mendukung X11, Xorg, dan Wayland)
#[cfg(target_os = "linux")]
fn get_mouse_position() -> Result<(i32, i32), String> {
    use std::process::Command;
    use std::env;

    // Deteksi session type
    let session_type = env::var("XDG_SESSION_TYPE").unwrap_or_default();
    
    // Method 1: Coba xdotool (bekerja di X11/Xorg dan XWayland)
    if let Ok(output) = Command::new("xdotool")
        .args(["getmouselocation", "--shell"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut x = 0i32;
            let mut y = 0i32;

            for line in stdout.lines() {
                if let Some(val) = line.strip_prefix("X=") {
                    x = val.parse().unwrap_or(0);
                } else if let Some(val) = line.strip_prefix("Y=") {
                    y = val.parse().unwrap_or(0);
                }
            }
            
            if x != 0 || y != 0 {
                return Ok((x, y));
            }
        }
    }

    // Method 2: Coba kdotool (untuk KDE Wayland)
    if session_type == "wayland" {
        if let Ok(output) = Command::new("kdotool")
            .args(["getmouselocation"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                // Format: x:123 y:456
                let mut x = 0i32;
                let mut y = 0i32;
                
                for part in stdout.split_whitespace() {
                    if let Some(val) = part.strip_prefix("x:") {
                        x = val.parse().unwrap_or(0);
                    } else if let Some(val) = part.strip_prefix("y:") {
                        y = val.parse().unwrap_or(0);
                    }
                }
                
                if x != 0 || y != 0 {
                    return Ok((x, y));
                }
            }
        }
    }

    // Method 3: Coba ydotool (Wayland alternative)
    if session_type == "wayland" {
        if let Ok(output) = Command::new("ydotool")
            .args(["getmouselocation"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let parts: Vec<&str> = stdout.split_whitespace().collect();
                if parts.len() >= 2 {
                    let x: i32 = parts[0].parse().unwrap_or(0);
                    let y: i32 = parts[1].parse().unwrap_or(0);
                    if x != 0 || y != 0 {
                        return Ok((x, y));
                    }
                }
            }
        }
    }

    // Method 4: Coba hyprctl (untuk Hyprland Wayland)
    if session_type == "wayland" {
        if let Ok(output) = Command::new("hyprctl")
            .args(["cursorpos"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                // Format: 123, 456
                let parts: Vec<&str> = stdout.split(',').map(|s| s.trim()).collect();
                if parts.len() >= 2 {
                    let x: i32 = parts[0].parse().unwrap_or(0);
                    let y: i32 = parts[1].parse().unwrap_or(0);
                    if x != 0 || y != 0 {
                        return Ok((x, y));
                    }
                }
            }
        }
    }

    // Method 5: Coba wlr-randr + slurp untuk wlroots-based compositors (Sway, etc)
    if session_type == "wayland" {
        if let Ok(output) = Command::new("slurp")
            .args(["-p", "-f", "%x %y"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let parts: Vec<&str> = stdout.split_whitespace().collect();
                if parts.len() >= 2 {
                    let x: i32 = parts[0].parse().unwrap_or(0);
                    let y: i32 = parts[1].parse().unwrap_or(0);
                    return Ok((x, y));
                }
            }
        }
    }

    // Method 6: Coba xinput untuk X11
    if let Ok(output) = Command::new("xinput")
        .args(["query-state", "2"])  // Device 2 biasanya mouse
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut x = 0i32;
            let mut y = 0i32;
            
            for line in stdout.lines() {
                if line.contains("valuator[0]=") {
                    if let Some(val) = line.split('=').nth(1) {
                        x = val.trim().parse().unwrap_or(0);
                    }
                } else if line.contains("valuator[1]=") {
                    if let Some(val) = line.split('=').nth(1) {
                        y = val.trim().parse().unwrap_or(0);
                    }
                }
            }
            
            if x != 0 || y != 0 {
                return Ok((x, y));
            }
        }
    }

    Err(format!(
        "Gagal mendapatkan posisi mouse. Session type: {}. \
        Untuk X11: install xdotool. \
        Untuk Wayland: install kdotool (KDE), ydotool, atau hyprctl (Hyprland)",
        session_type
    ))
}

/// Mendapatkan posisi mouse saat ini (macOS)
#[cfg(target_os = "macos")]
fn get_mouse_position() -> Result<(i32, i32), String> {
    use std::process::Command;

    // Menggunakan AppleScript untuk mendapatkan posisi mouse di macOS
    let output = Command::new("osascript")
        .args(["-e", "tell application \"System Events\" to get the position of the mouse"])
        .output()
        .map_err(|e| format!("Failed to get mouse location: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<&str> = stdout.split(", ").collect();
    
    if parts.len() >= 2 {
        let x = parts[0].parse().unwrap_or(0);
        let y = parts[1].parse().unwrap_or(0);
        Ok((x, y))
    } else {
        Err("Failed to parse mouse position".to_string())
    }
}

/// Mendapatkan posisi mouse saat ini (Windows)
#[cfg(target_os = "windows")]
fn get_mouse_position() -> Result<(i32, i32), String> {
    // Fallback: return center of primary monitor
    // Untuk implementasi penuh, tambahkan windows crate dengan fitur Win32_UI_WindowsAndMessaging
    Err("Mouse position not implemented for Windows yet".to_string())
}

/// Mencari index monitor yang mengandung posisi tertentu
fn find_monitor_at_position(monitors: &[Monitor], x: i32, y: i32) -> Option<usize> {
    for (idx, monitor) in monitors.iter().enumerate() {
        let mon_x = monitor.x();
        let mon_y = monitor.y();
        let mon_width = monitor.width() as i32;
        let mon_height = monitor.height() as i32;

        if x >= mon_x && x < mon_x + mon_width && y >= mon_y && y < mon_y + mon_height {
            return Some(idx);
        }
    }
    None
}

/// Informasi dukungan multi-monitor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiMonitorSupport {
    pub supported: bool,
    pub session_type: String,
    pub available_tools: Vec<String>,
    pub missing_tools: Vec<String>,
    pub install_command: String,
}

/// Cek apakah tools untuk mendapatkan posisi mouse tersedia
#[cfg(target_os = "linux")]
#[tauri::command]
pub fn check_multi_monitor_support() -> MultiMonitorSupport {
    use std::process::Command;
    use std::env;

    let session_type = env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string());
    let mut available_tools = Vec::new();
    let mut missing_tools = Vec::new();

    // Cek xdotool (X11/XWayland)
    if Command::new("which").arg("xdotool").output()
        .map(|o| o.status.success()).unwrap_or(false) {
        available_tools.push("xdotool".to_string());
    } else {
        missing_tools.push("xdotool".to_string());
    }

    // Cek kdotool (KDE Wayland)
    if Command::new("which").arg("kdotool").output()
        .map(|o| o.status.success()).unwrap_or(false) {
        available_tools.push("kdotool".to_string());
    }

    // Cek ydotool (Wayland)
    if Command::new("which").arg("ydotool").output()
        .map(|o| o.status.success()).unwrap_or(false) {
        available_tools.push("ydotool".to_string());
    }

    // Cek hyprctl (Hyprland)
    if Command::new("which").arg("hyprctl").output()
        .map(|o| o.status.success()).unwrap_or(false) {
        available_tools.push("hyprctl".to_string());
    }

    // Cek slurp (wlroots)
    if Command::new("which").arg("slurp").output()
        .map(|o| o.status.success()).unwrap_or(false) {
        available_tools.push("slurp".to_string());
    }

    let supported = !available_tools.is_empty();
    
    // Generate install command berdasarkan session type
    let install_command = if session_type == "wayland" {
        if env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase().contains("kde") {
            "sudo apt install kdotool  # atau dari AUR untuk Arch".to_string()
        } else if env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase().contains("hyprland") {
            "# hyprctl sudah tersedia dengan Hyprland".to_string()
        } else {
            "sudo apt install xdotool  # untuk XWayland compatibility".to_string()
        }
    } else {
        "sudo apt install xdotool".to_string()
    };

    MultiMonitorSupport {
        supported,
        session_type,
        available_tools,
        missing_tools,
        install_command,
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn check_multi_monitor_support() -> MultiMonitorSupport {
    MultiMonitorSupport {
        supported: true,
        session_type: "macos".to_string(),
        available_tools: vec!["osascript".to_string()],
        missing_tools: vec![],
        install_command: "# Tidak perlu install tambahan di macOS".to_string(),
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn check_multi_monitor_support() -> MultiMonitorSupport {
    MultiMonitorSupport {
        supported: false,
        session_type: "windows".to_string(),
        available_tools: vec![],
        missing_tools: vec!["win32api".to_string()],
        install_command: "# Fitur ini belum tersedia untuk Windows".to_string(),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SelectionCoords {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone)]
pub struct MonitorInfo {
    pub image: image::RgbaImage,
}

// Store captured images from all monitors temporarily for cropping
pub struct CaptureState {
    pub captured_monitors: Arc<Mutex<HashMap<usize, MonitorInfo>>>,
    pub overlay_active: Arc<AtomicBool>,
}

impl Default for CaptureState {
    fn default() -> Self {
        Self {
            captured_monitors: Arc::default(),
            overlay_active: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[tauri::command]
pub async fn start_screen_capture(app: tauri::AppHandle) -> Result<(), String> {
    // Get all monitors
    let capture_monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

    if capture_monitors.is_empty() {
        return Err("No monitors found".to_string());
    }

    // Get monitor layout info from Tauri for accurate sizing/positioning
    let tauri_monitors = app
        .available_monitors()
        .map_err(|e| format!("Failed to get monitor layout: {}", e))?;

    if tauri_monitors.len() != capture_monitors.len() {
        eprintln!(
            "Monitor count mismatch between capture ({}) and layout ({}); falling back to capture dimensions",
            capture_monitors.len(),
            tauri_monitors.len()
        );
    }

    let state = app.state::<CaptureState>();
    if state.overlay_active.load(Ordering::SeqCst) {
        // Attempt to clean up any stale overlays before proceeding
        let _ = close_overlay_window(app.clone());
    }
    state.overlay_active.store(true, Ordering::SeqCst);
    let mut captured_monitors = HashMap::new();

    // Capture all monitors and store their info
    for (idx, monitor) in capture_monitors.iter().enumerate() {
        let captured_image = monitor.capture_image().map_err(|e| {
            state.overlay_active.store(false, Ordering::SeqCst);
            format!("Failed to capture monitor {}: {}", idx, e)
        })?;

        let monitor_info = MonitorInfo {
            image: captured_image,
        };

        captured_monitors.insert(idx, monitor_info);
    }

    // Store all captured monitors
    *state.captured_monitors.lock().unwrap() = captured_monitors;

    // Clean up any existing overlay windows before creating new ones
    for (label, window) in app.webview_windows() {
        if label.starts_with("capture-overlay-") {
            window.destroy().ok();
        }
    }

    // Create overlay windows for all monitors
    for (idx, monitor) in capture_monitors.iter().enumerate() {
        let (logical_width, logical_height, logical_x, logical_y) =
            if let Some(display) = tauri_monitors.get(idx) {
                let scale_factor = display.scale_factor();
                let size = display.size();
                let position = display.position();

                // Size values are in physical pixels; convert to logical units for window placement
                let width = size.width as f64 / scale_factor;
                let height = size.height as f64 / scale_factor;
                let x = position.x as f64 / scale_factor;
                let y = position.y as f64 / scale_factor;

                (width, height, x, y)
            } else {
                // Fallback to xcap monitor info if Tauri monitor data is unavailable/mismatched
                (
                    monitor.width() as f64,
                    monitor.height() as f64,
                    monitor.x() as f64,
                    monitor.y() as f64,
                )
            };

        let window_label = format!("capture-overlay-{}", idx);

        let overlay =
            WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App("index.html".into()))
                .title("Screen Capture")
                .inner_size(logical_width, logical_height)
                .position(logical_x, logical_y)
                .transparent(true)
                .always_on_top(true)
                .decorations(false)
                .skip_taskbar(true)
                .resizable(false)
                .closable(false)
                .minimizable(false)
                .maximizable(false)
                .visible(false)
                .focused(true)
                .accept_first_mouse(true)
                .build()
                .map_err(|e| {
                    state.overlay_active.store(false, Ordering::SeqCst);
                    format!("Failed to create overlay window {}: {}", idx, e)
                })?;

        // Wait a short moment for content to load before showing
        thread::sleep(Duration::from_millis(100));

        overlay.show().ok();
        overlay.set_always_on_top(true).ok();

        if monitor.is_primary() {
            overlay.set_focus().ok();
            overlay
                .request_user_attention(Some(tauri::UserAttentionType::Critical))
                .ok();
        }
    }

    // Give a moment for all windows to settle, then focus primary again
    std::thread::sleep(std::time::Duration::from_millis(100));

    for (idx, monitor) in capture_monitors.iter().enumerate() {
        if monitor.is_primary() {
            let window_label = format!("capture-overlay-{}", idx);
            if let Some(window) = app.get_webview_window(&window_label) {
                window.set_focus().ok();
            }
            break;
        }
    }

    Ok(())
}

// close overlay window
#[tauri::command]
pub fn close_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    // Get all webview windows and close those that are capture overlays
    let webview_windows = app.webview_windows();

    for (label, window) in webview_windows.iter() {
        if label.starts_with("capture-overlay-") {
            window.destroy().ok();
        }
    }

    // Clear captured monitors from state
    let state = app.state::<CaptureState>();
    state.captured_monitors.lock().unwrap().clear();
    state.overlay_active.store(false, Ordering::SeqCst);

    // Emit an event to the main window to signal that the overlay has been closed
    if let Some(main_window) = app.get_webview_window("main") {
        main_window.emit("capture-closed", ()).unwrap();
    }

    Ok(())
}

#[tauri::command]
pub async fn capture_selected_area(
    app: tauri::AppHandle,
    coords: SelectionCoords,
    monitor_index: usize,
) -> Result<String, String> {
    // Get the stored captured monitors
    let state = app.state::<CaptureState>();
    let mut captured_monitors = state.captured_monitors.lock().unwrap();

    let monitor_info = captured_monitors.remove(&monitor_index).ok_or({
        state.overlay_active.store(false, Ordering::SeqCst);
        format!("No captured image found for monitor {}", monitor_index)
    })?;

    // Validate coordinates
    if coords.width == 0 || coords.height == 0 {
        return Err("Invalid selection dimensions".to_string());
    }

    let img_width = monitor_info.image.width();
    let img_height = monitor_info.image.height();

    // Ensure coordinates are within bounds
    let x = coords.x.min(img_width.saturating_sub(1));
    let y = coords.y.min(img_height.saturating_sub(1));
    let width = coords.width.min(img_width - x);
    let height = coords.height.min(img_height - y);

    // Crop the image to the selected area
    let cropped = monitor_info.image.view(x, y, width, height).to_image();

    // Encode to PNG and base64
    let mut png_buffer = Vec::new();
    PngEncoder::new(&mut png_buffer)
        .write_image(
            cropped.as_raw(),
            cropped.width(),
            cropped.height(),
            ColorType::Rgba8.into(),
        )
        .map_err(|e| format!("Failed to encode to PNG: {}", e))?;

    let base64_str = base64::engine::general_purpose::STANDARD.encode(png_buffer);

    captured_monitors.clear();
    drop(captured_monitors);

    // Close all overlay windows
    let webview_windows = app.webview_windows();
    for (label, window) in webview_windows.iter() {
        if label.starts_with("capture-overlay-") {
            window.destroy().ok();
        }
    }

    // Emit event with base64 data
    app.emit("captured-selection", &base64_str)
        .map_err(|e| format!("Failed to emit captured-selection event: {}", e))?;

    state.overlay_active.store(false, Ordering::SeqCst);

    Ok(base64_str)
}

#[tauri::command]
pub async fn capture_to_base64(_window: tauri::WebviewWindow) -> Result<String, String> {
    // Coba dapatkan posisi mouse terlebih dahulu
    let mouse_pos = get_mouse_position().ok();

    tauri::async_runtime::spawn_blocking(move || {
        let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;
        if monitors.is_empty() {
            return Err("No monitors found".to_string());
        }

        // Tentukan target monitor berdasarkan posisi mouse
        let target_idx = if let Some((mouse_x, mouse_y)) = mouse_pos {
            // Cari monitor yang mengandung posisi mouse
            find_monitor_at_position(&monitors, mouse_x, mouse_y).unwrap_or(0)
        } else {
            // Fallback ke primary monitor jika gagal mendapatkan posisi mouse
            monitors
                .iter()
                .position(|m| m.is_primary())
                .unwrap_or(0)
        };

        let monitor = monitors
            .into_iter()
            .enumerate()
            .find_map(|(idx, monitor)| {
                if idx == target_idx {
                    Some(monitor)
                } else {
                    None
                }
            })
            .ok_or_else(|| "Failed to determine target monitor".to_string())?;

        let image = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture image: {}", e))?;
        let mut png_buffer = Vec::new();
        PngEncoder::new(&mut png_buffer)
            .write_image(
                image.as_raw(),
                image.width(),
                image.height(),
                ColorType::Rgba8.into(),
            )
            .map_err(|e| format!("Failed to encode to PNG: {}", e))?;
        let base64_str = base64::engine::general_purpose::STANDARD.encode(png_buffer);

        Ok(base64_str)
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
}
