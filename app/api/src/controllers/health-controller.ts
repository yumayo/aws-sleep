import { FastifyRequest, FastifyReply } from 'fastify'

export const getHealth = async (_request: FastifyRequest, _reply: FastifyReply) => {
  return { status: 'ok', timestamp: new Date().toISOString() }
}