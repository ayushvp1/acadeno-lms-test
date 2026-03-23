require('dotenv').config();
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

redis.set('test_key', 'Redis is working!')
  .then(() => redis.get('test_key'))
  .then((value) => {
    console.log('Redis says:', value);
    redis.disconnect();
  })
  .catch((err) => {
    console.error('Redis error:', err.message);
  });
