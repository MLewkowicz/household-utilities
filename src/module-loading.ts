export function isModuleLoadError(error:unknown){
 const message=error instanceof Error?error.message:String(error);
 return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(message);
}
