import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    res.status(200).json({
      status: 'ok',
      message: 'VPIN API test',
      env: {
        hasRedisUrl: !!process.env.UPSTASH_REDIS_REST_URL,
        hasRedisToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown',
    });
  }
}
