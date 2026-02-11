declare module 'express' {
  // Minimal Response typing used by controllers for file downloads.
  // Render builds may install production deps only, so we avoid relying on @types/express.
  export interface Response {
    setHeader(name: string, value: string): any;
    send(body: any): any;
  }
}

