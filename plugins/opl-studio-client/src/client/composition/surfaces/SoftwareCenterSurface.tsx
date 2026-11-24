import { ApplicationManagementPage, type ApplicationManagementPageProps } from "../../workbench/ApplicationManagementPage";

export type SoftwareCenterSurfaceProps = ApplicationManagementPageProps;

/** Independent Software Center composition surface owning catalog, updates, activity, and sources tabs. */
export function SoftwareCenterSurface(props: SoftwareCenterSurfaceProps) {
  return <ApplicationManagementPage {...props} />;
}
