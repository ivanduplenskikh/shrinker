import { createRoot } from "react-dom/client";
import { Dashboard } from "./dashboard";

const root = document.getElementById("root");
if (!root) throw new Error("Dashboard root element is missing");
createRoot(root).render(<Dashboard />);
