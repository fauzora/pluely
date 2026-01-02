import {
  Theme,
  AlwaysOnTopToggle,
  AppIconToggle,
  AutostartToggle,
} from "./components";
import { PageLayout } from "@/layouts";
import { MultiMonitorWarning } from "@/components";

const Settings = () => {
  return (
    <PageLayout title="Settings" description="Manage your settings">
      {/* Multi-Monitor Screenshot Support */}
      <MultiMonitorWarning showAlways />

      {/* Theme */}
      <Theme />

      {/* Autostart Toggle */}
      <AutostartToggle />

      {/* App Icon Toggle */}
      <AppIconToggle />

      {/* Always On Top Toggle */}
      <AlwaysOnTopToggle />
    </PageLayout>
  );
};

export default Settings;
