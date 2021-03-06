import os from 'os';
import Koa from 'koa';
import serve from 'koa-static';
import RedisHelper from './redis-helper';

const REDIS_HOST = 'localhost';
const REDIS_PORT = 6379;

const app = new Koa();
const router = require('koa-router')();

app.use(serve('./public'));
app.use(router.routes());

/**
 * Server
 */
const server = app.listen(process.argv[2]);
console.log(`Listening ${process.argv[2]}...`);
const io = require('socket.io').listen(server);

/**
 * Redis
 */
const emitter = require('socket.io-emitter')({ host: REDIS_HOST, port: REDIS_PORT });
const redis = require('redis').createClient;
const pub = redis(REDIS_PORT, REDIS_HOST);
const sub = redis(REDIS_PORT, REDIS_HOST);
const redisAdapter = require('socket.io-redis');

io.adapter(redisAdapter({ host: REDIS_HOST, port: REDIS_PORT, pubClient: pub, subClient: sub }));
io.use(middlewareAttachUserId);

const helper = new RedisHelper(redis(REDIS_PORT, REDIS_HOST), os.hostname(), process.argv[2]);
helper.init();

/**
 * Events
 */
io.on('connection', (socket) => {
  console.log('connection', socket.id, socket.userId);
  helper.set(socket.userId, socket.id);
  socket.on('disconnect', () => {
    console.log('disconnect', socket.id, socket.userId);
    helper.del(socket.userId, socket.id);
  });
});

/**
 * Routing
 */
router.get('/message/to/:id/:message', async (ctx, next) => {
  await helper.fetchSocketIds(ctx.params.id)
    .then(socketIds => {
      console.log('socketIds', socketIds);
      ctx.body = `<p>Sent message to socket ids [${socketIds.join(', ')}]</p>`;
      socketIds.forEach((socketId) => {
        emitter.to(socketId).emit('push_message', `${ctx.params.message} - ${new Date()}`);
      });
    })
    .catch(err => {
      console.log(err);
      ctx.body = err;
    });
});

function middlewareAttachUserId (socket, next) {
  // console.log('Token =', socket.handshake.query.token);
  // TODO: Using token instead of real userId in this sample.
  socket.userId = socket.handshake.query.token;
  next(); // MUST call next() in middleware
}
