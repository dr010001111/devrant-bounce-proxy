import express = require('express');
import bodyParser = require('body-parser');

// @ts-ignore
import { v4 as uuidv4 } from 'uuid';

// @ts-ignore
import proxy = require('express-http-proxy');

// @ts-ignore
import fetch = require('node-fetch');

const { spawn } = require('child_process');

// const motherland = "https://proxy.devrant.app";
const motherland = "http://localhost:6969";

const randomPort = Math.round(Math.random() * 1e4);
const proxyPort = randomPort + 1;

const localCorsProxy = `http://localhost:${proxyPort}/proxy/`

const isMaster = process.argv[process.argv.length - 1].match("--master")

const app: express.Application = express();
app.use(bodyParser.json());

const thisServerUUID = uuidv4();

interface CountersDef {
  [serverId: string]: number
}

const counters: CountersDef = {}

function register() {
  fetch(motherland + '/register', {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      uuid: thisServerUUID
    })
  })
}

function main() {
  app.post('/register', function (req, res) {
    if (req.body && req.body.uuid) {
      const id = req.body.uuid
      counters[id] = 0;
      res.json(counters);
      console.log(`REGISTER ${id}`);
    } else {
      res.json({
        error: "No server UUID given"
      })
    }
  });

  app.all('*', proxy(localCorsProxy, {
    proxyReqPathResolver: (req: any, res: any) => {
      return req.url.replace(/^(\/proxy\/|\/)/gi, '/proxy/')
    }
  }));

  const child = spawn('npx', ['local-cors-proxy', "--proxyUrl", "https://www.devrant.io", "--port", proxyPort]);

  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr);

  child.on('close', (code: any) => {
    console.log(`child process exited with code ${code}`);
  });

  app.listen(isMaster ? 6969 : randomPort, function () {
    console.log('App is listening!', !isMaster && randomPort);
    register()
  });
}

main();