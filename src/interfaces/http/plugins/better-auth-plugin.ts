import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { auth } from "@infra/auth";

// Extend Fastify types for custom decorations
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }

  interface FastifyRequest {
    session?: any;
  }
}

const betterAuthPlugin: FastifyPluginAsync = fp(async (fastify) => {
  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const fetchHeaders = new Headers(request.headers as HeadersInit);

        // Verify session using Better Auth
        const sessionData = await auth.api.getSession({
          headers: fetchHeaders,
        });

        if (!sessionData || !sessionData.session || !sessionData.user) {
          return reply.code(401).send({ error: "Invalid or expired session" });
        }

        // Get user with project data from our database
        const { userService } = await import('@infra/dal/user');
        const user = await userService.getUserById(sessionData.user.id);

        // Attach session details to the request for later use
        request.session = sessionData.session;
        request.user = {
          sub: sessionData.user.id,
          email: sessionData.user.email,
          email_verified: sessionData.user.emailVerified,
          project: user?.project ? {
            id: user.project.id,
            shopDomain: user.project.shopDomain,
            brandAnalysis: user.project.brandAnalysis,
          } : null,
        };
      } catch (err) {
        return reply.code(500).send({ error: "Authentication error" });
      }
    }
  );
});

export default fp(betterAuthPlugin);
