import { useState, useEffect } from "react";

export function ClientOnlyCanvas() {
  const [Canvas, setCanvas] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    import("./EditorCanvas").then((mod) => {
      setCanvas(() => mod.EditorCanvas);
    });
  }, []);

  if (!Canvas) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading canvas...
      </div>
    );
  }

  return <Canvas />;
}
