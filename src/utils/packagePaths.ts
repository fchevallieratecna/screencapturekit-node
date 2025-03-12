import path from "path";
import { fileURLToPath } from "url";

declare global {
  namespace NodeJS {
    interface Process {
      resourcesPath?: string;
    }
  }
}

export const getPackageRoot = () => {
  try {
    // Résolution via le point d'entrée du package
    const app = require("electron").app;
    const packageMainPath = require.resolve("screencapturekit");
    if (typeof process.resourcesPath === "string" && app?.isPackaged) {
      const finalPath = path.join(process.resourcesPath);
      console.log("finalPath : CJS", finalPath);
      return finalPath;
    }
    const finalPath = path.dirname(packageMainPath);
    console.log("finalPath : CJS", finalPath);
    return finalPath;
  } catch (e) {
    // Fallback pour le développement ES modules
    const __filename = fileURLToPath(import.meta.url);
    const finalPath = path.join(path.dirname(__filename));
    console.log("finalPath : ESM", finalPath);
    return finalPath;
  }
};

export const resolvePackagePath = (...segments: string[]) =>
  path.join(getPackageRoot(), ...segments);
