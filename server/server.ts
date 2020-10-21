import express = require('express');
import bodyParser = require('body-parser');

// @ts-ignore
import { v4 as uuidv4 } from 'uuid';

// @ts-ignore
import fetch = require('node-fetch');

const httpProxy = require('http-proxy');

// const motherland = "https://proxy.devrant.app";
const masterPort = 4421;
const motherland = `http://localhost:${masterPort}`;

const isMaster = process.argv[process.argv.length - 1].match("--master")
const usePort = isMaster ? masterPort : 1024 + Math.round(Math.random() * 1e3);

const app: express.Application = express();
app.use(bodyParser.json());

const thisServerUUID = uuidv4();

var proxyServer = httpProxy.createProxyServer({});

interface CountersDef {
  [serverId: string]: {
    target: string;
    count: number;
  }
}

let registry: CountersDef = {
  [thisServerUUID]: {
    target: 'https://devrant.com',
    count: 0
  }
}

async function sync() {
  const response = await fetch(motherland + '/sync', {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      uuid: thisServerUUID,
      port: usePort
    })
  })

  if (response.ok) {
    registry = await response.json()
  } else {
    console.error('Unable to sync!!!', response)
  }
}

function main() {
  app.post('/sync', function (req, res) {
    if (req.body && req.body.uuid) {
      const { port, uuid: id } = req.body
      var ip = String(req.headers['x-forwarded-for'] || req.connection.remoteAddress);
      if (ip.substr(0, 7) == "::ffff:") {
        ip = ip.substr(7)
      }
      res.json(registry);
      registry[id] = {
        count: 0,
        target: `http://${ip}:${port}`
      };
      console.log(`Register ${ip} ${id}`);
    } else {
      res.json({
        error: "No server UUID given"
      })
    }
  });

  // app.all('*', proxy(localCorsProxy, {
  //   proxyReqPathResolver: (req: any, res: any) => {
  //     return req.url.replace(/^(\/proxy\/|\/)/gi, '/proxy/')
  //   }
  // }));

  app.all('*', (req, res, next) => {
    const prioritized = Object.entries(registry).sort(
      ([_aId, a], [_bId, b]) => a.count > b.count ? 0 : -1
    )
    const [_id, proxy] = prioritized[0];
    const target = proxy.target;
    res.header('X-Proxied-By', "devrant.app Proxy Service");
    proxyServer.web(req, res, { target, changeOrigin: 'http://devrant.com/' }, next);
    res.header('Location', '')
    registry[_id].count = registry[_id].count + 1
    process.stdout.write(`>> ${target}${req.path} proxy to lowest target ${proxy.count} with id ${_id} at ${proxy.target}\r`);
  });

  proxyServer.on('proxyRes', function (proxyRes: any, req: any, res: any) {
    delete proxyRes.headers['location'];
  });

  app.listen(usePort, function () {
    console.log('Proxy is listening!', usePort);
    if (!isMaster) {
      sync()
    }
  });
}

main();