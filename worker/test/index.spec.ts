import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src";

describe("Worker API", () => {
	describe("GET /", () => {
		it('responds with SPA index.html (unit style)', async () => {
			const request = new Request<unknown, IncomingRequestCfProperties>(
				"http://example.com/"
			);
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain("しゃべチャイナ");
			expect(text).toContain("<!doctype html>");
		});

		it('responds with SPA index.html (integration style)', async () => {
			const request = new Request("http://example.com/");
			const response = await SELF.fetch(request);
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain("しゃべチャイナ");
		});
	});

	describe("GET /api/health", () => {
		it("responds with health status", async () => {
			const request = new Request("http://example.com/api/health");
			const response = await SELF.fetch(request);
			expect(response.status).toBe(200);
			const data = (await response.json()) as { status: string };
			expect(data.status).toBe("ok");
		});
	});
});
