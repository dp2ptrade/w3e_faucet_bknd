import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { config } from '@/config/environment';
import { logger } from '@/utils/logger';

// Request schemas
interface VerifyRequest {
  Body: {
    challenge: string;
    nonce: string;
    solution: string;
  };
}

// Store active challenges
const challenges = new Map<string, { timestamp: number; difficulty: number }>();

// Clean up expired challenges every minute
setInterval(() => {
  const now = Date.now();
  for (const [challenge, data] of challenges.entries()) {
    if (now - data.timestamp > 600000) { // 10 minutes
      challenges.delete(challenge);
    }
  }
}, 60000);

export async function powRoutes(server: FastifyInstance): Promise<void> {
  // Get proof-of-work challenge
  server.get('/challenge', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Generate random challenge
      const challenge = crypto.randomBytes(32).toString('hex');
      const timestamp = Date.now();
      const difficulty = config.pow.difficulty;
      
      // Store challenge
      challenges.set(challenge, { timestamp, difficulty });
      
      // Create target (number of leading zeros)
      const target = '0'.repeat(difficulty);
      
      logger.info(`Generated PoW challenge: ${challenge} (difficulty: ${difficulty})`);
      
      return reply.send({
        challenge,
        difficulty,
        target,
        algorithm: 'SHA-256',
        expiresAt: timestamp + 600000, // 10 minutes
        instructions: {
          description: 'Find a nonce that when combined with the challenge produces a hash starting with the required number of zeros',
          example: 'hash = SHA-256(challenge + nonce)',
        },
      });
      
    } catch (error) {
      logger.error('Error generating PoW challenge:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to generate challenge',
      });
    }
  });
  
  // Verify proof-of-work solution
  server.post<VerifyRequest>('/verify', async (request: FastifyRequest<VerifyRequest>, reply: FastifyReply) => {
    try {
      const { challenge, nonce, solution } = request.body;
      
      // Validate inputs
      if (!challenge || !nonce || !solution) {
        return reply.status(400).send({
          error: 'Missing Data',
          message: 'Challenge, nonce, and solution are required',
        });
      }
      
      // Check if challenge exists and is valid
      const challengeData = challenges.get(challenge);
      if (!challengeData) {
        return reply.status(400).send({
          error: 'Invalid Challenge',
          message: 'Challenge not found or expired',
        });
      }
      
      // Check if challenge is expired
      if (Date.now() - challengeData.timestamp > 600000) {
        challenges.delete(challenge);
        return reply.status(400).send({
          error: 'Expired Challenge',
          message: 'Challenge has expired, please request a new one',
        });
      }
      
      // Verify the solution
      const expectedHash = crypto
        .createHash('sha256')
        .update(challenge + nonce)
        .digest('hex');
      
      if (expectedHash !== solution) {
        return reply.status(400).send({
          error: 'Invalid Solution',
          message: 'The provided solution does not match the expected hash',
        });
      }
      
      // Check if solution meets difficulty requirement
      const target = '0'.repeat(challengeData.difficulty);
      if (!solution.startsWith(target)) {
        return reply.status(400).send({
          error: 'Insufficient Difficulty',
          message: `Solution must start with ${challengeData.difficulty} zeros`,
        });
      }
      
      // Calculate solve time
      const solveTime = Date.now() - challengeData.timestamp;
      
      // Remove used challenge
      challenges.delete(challenge);
      
      logger.info(`PoW solution verified: ${challenge} (solve time: ${solveTime}ms)`);
      
      return reply.send({
        valid: true,
        challenge,
        nonce,
        solution,
        difficulty: challengeData.difficulty,
        solveTime,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      logger.error('Error verifying PoW solution:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to verify solution',
      });
    }
  });
  
  // Get current difficulty and stats
  server.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.send({
        currentDifficulty: config.pow.difficulty,
        targetTime: config.pow.targetTime,
        activeChallenges: challenges.size,
        algorithm: 'SHA-256',
        maxChallengeAge: 600000, // 10 minutes
      });
      
    } catch (error) {
      logger.error('Error fetching PoW stats:', error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch statistics',
      });
    }
  });
}