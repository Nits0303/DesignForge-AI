import { WorkspaceClient } from "@/components/workspace/WorkspaceClient";
import { WorkspaceErrorBoundary } from "@/components/workspace/WorkspaceErrorBoundary";

export default function WorkspacePage() {
  return (
    <WorkspaceErrorBoundary>
      <WorkspaceClient />
    </WorkspaceErrorBoundary>
  );
}

