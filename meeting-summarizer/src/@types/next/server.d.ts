declare module "next/server" {
  export class NextResponse {
    static json(data: any, init?: { status?: number }): Response;
  }
}
