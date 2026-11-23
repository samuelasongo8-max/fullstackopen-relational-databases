
/**
 * Test runner for Full Stack Open Exercise 17.
 *
 * Responsibilities:
 * 1. Start the backend in test mode.
 * 2. Wait until the backend is ready.
 * 3. Run the official Node.js API tests.
 * 4. Stop the backend, even when tests fail.
 *
 * Compatible with Windows and Linux.
 */

const { spawn } = require('child_process');
const { setTimeout: delay } = require('timers/promises');

const PORT = process.env.PORT || 3001;
const HOST = '127.0.0.1';
const MAX_RETRIES = 50;
const RETRY_DELAY = 100;
const TEST_SCRIPT = 'tests/api_ch3.test.js';

let serverProcess;
let serverExited = false;
let serverExitCode = null;
let serverExitSignal = null;

function startServer() {
  console.log('Starting test server...');

  serverProcess = spawn('node', ['index.js'], {
    env: {
      ...process.env,
      TESTING: 'true',
      NODE_ENV: undefined,
      PORT: String(PORT)
    },
    stdio: 'inherit',
    windowsHide: true
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start the test server:', error.message);
  });

  serverProcess.on('exit', (code, signal) => {
    serverExited = true;
    serverExitCode = code;
    serverExitSignal = signal;
  });
}

async function checkServer() {
  try {
    const response = await fetch(`http://${HOST}:${PORT}/`, {
      signal: AbortSignal.timeout(2000)
    });

    return response.status === 200;
  } catch {
    return false;
  }
}

async function waitForServer() {
  console.log('Waiting for the backend to become ready...');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (serverExited) {
      throw new Error(
        `Test server stopped unexpectedly. Exit code: ${serverExitCode}, signal: ${serverExitSignal}`
      );
    }

    if (await checkServer()) {
      console.log(`Server is ready after ${attempt} attempt(s).`);
      return;
    }

    await delay(RETRY_DELAY);
  }

  throw new Error(
    `Server did not become ready within ${MAX_RETRIES} attempts.`
  );
}

function runOfficialTests() {
  return new Promise((resolve, reject) => {
    console.log('Running official Exercise 17 tests...');

    const testProcess = spawn(
      process.execPath,
      [
        '--test',
        '--test-concurrency=1',
        TEST_SCRIPT
      ],
      {
        env: {
          ...process.env,
          TESTING: 'true'
        },
        stdio: 'inherit',
        windowsHide: true
      }
    );

    testProcess.on('error', reject);

    testProcess.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Test process terminated by signal: ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`Official tests failed with exit code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function stopServer() {
  if (!serverProcess || serverExited) {
    return;
  }

  console.log('Stopping test server...');

  const exitPromise = new Promise((resolve) => {
    if (serverExited) {
      resolve();
      return;
    }

    serverProcess.once('exit', resolve);
  });

  try {
    serverProcess.kill();
  } catch (error) {
    console.error('Error stopping test server:', error.message);
  }

  const exited = await Promise.race([
    exitPromise.then(() => true),
    delay(5000).then(() => false)
  ]);

  if (!exited && !serverExited) {
    console.error('Server did not stop within 5 seconds.');

    if (process.platform === 'win32') {
      const { spawn } = require('child_process');

      const killer = spawn(
        'taskkill',
        ['/pid', String(serverProcess.pid), '/T', '/F'],
        { stdio: 'ignore', windowsHide: true }
      );

      await new Promise((resolve) => {
        killer.once('error', resolve);
        killer.once('exit', resolve);
      });
    } else {
      serverProcess.kill('SIGKILL');
    }

    await Promise.race([
      exitPromise,
      delay(3000)
    ]);
  }

  console.log('Server cleanup finished.');
}

async function main() {
  let exitCode = 1;

  try {
    startServer();

    await waitForServer();

    await runOfficialTests();

    console.log('All official Exercise 17 tests passed.');
    exitCode = 0;
  } catch (error) {
    console.error('\nTest runner error:', error.message);
    exitCode = 1;
  } finally {
    await stopServer();
  }

  process.exitCode = exitCode;
}

main();
