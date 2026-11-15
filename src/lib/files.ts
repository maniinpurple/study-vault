/** URL of a stored file (exam page, thumbnail, question crop). Served only to its owner by `/api/files`. */
export function storedFileUrl(path: string): string {
  return `/api/files/${path.split("/").map(encodeURIComponent).join("/")}`;
}
