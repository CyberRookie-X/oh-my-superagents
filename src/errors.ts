export class MissingConfigError extends Error {
  readonly code = "MISSING_CONFIG" as const;
  readonly command: string;

  constructor(command: string) {
    super(`Command ${command} requires a real config source`);
    this.name = "MissingConfigError";
    this.command = command;
  }
}
