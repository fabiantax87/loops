/** Where you are. A single-user desktop app needs no more router than this. */
export type Screen =
  | { name: "today" }
  | { name: "client"; clientId: number }
  | { name: "archive" };
