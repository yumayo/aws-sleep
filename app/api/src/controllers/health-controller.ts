import { FastifyRequest, FastifyReply } from 'fastify'

export const getHealth = async (request: FastifyRequest, reply: FastifyReply) => {
  return { status: 'ok', timestamp: new Date().toISOString() }
}