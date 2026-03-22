import { spawn } from 'node:child_process';
import { config } from '../config.js';

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

class LocalExecutor {
  async executePython(code: string, cwd?: string): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn(config.python.path, ['-c', code], {
        cwd: cwd || process.cwd(),
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', reject);
      proc.on('close', (exitCode) => {
        resolve({
          stdout,
          stderr,
          exitCode: exitCode ?? 0,
        });
      });
    });
  }

  async checkPythonPackage(packageName: string): Promise<boolean> {
    const result = await this.executePython(`import ${packageName}`);
    return result.exitCode === 0;
  }
}

export const localExecutor = new LocalExecutor();
