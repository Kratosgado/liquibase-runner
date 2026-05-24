import { spawn } from 'node:child_process';
import type { LiquibaseCommand, LiquibaseProject, CommandResult, RunnerEvent } from '../types/index.js';
import type { IRunStrategy } from './IRunStrategy.js';
import { MavenStrategy } from './MavenStrategy.js';
import { GradleStrategy } from './GradleStrategy.js';
import { CliStrategy } from './CliStrategy.js';

export class CommandRunner {
	private abortController: AbortController | undefined;

	constructor(private readonly strategy: IRunStrategy) {}

	run(
		command: LiquibaseCommand,
		project: LiquibaseProject,
		extraArgs?: Record<string, string>,
		onEvent?: (event: RunnerEvent) => void,
	): Promise<CommandResult> {
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		const executable = this.strategy.getExecutable(project);
		const args = this.strategy.buildArgs(command, project, extraArgs);
		const cwd = this.strategy.getCwd(project);
		const startTime = Date.now();

		onEvent?.({ type: 'command', data: [executable, ...args].join(' ') });

		return new Promise((resolve, reject) => {
			const child = spawn(executable, args, {
				cwd,
				env: { ...process.env },
				shell: process.platform === 'win32',
				signal,
			});

			let stdout = '';
			let stderr = '';

			child.stdout.on('data', (chunk: Buffer) => {
				const data = chunk.toString();
				stdout += data;
				onEvent?.({ type: 'stdout', data });
			});

			child.stderr.on('data', (chunk: Buffer) => {
				const data = chunk.toString();
				stderr += data;
				onEvent?.({ type: 'stderr', data });
			});

			child.on('error', (err: NodeJS.ErrnoException) => {
				if (err.code === 'ABORT_ERR') {
					onEvent?.({ type: 'exit', data: '' });
					resolve({ exitCode: -1, stdout, stderr, durationMs: Date.now() - startTime });
				} else {
					onEvent?.({ type: 'error', data: err.message });
					reject(err);
				}
			});

			child.on('close', (code: number | null) => {
				const exitCode = code ?? -1;
				onEvent?.({ type: 'exit', data: String(exitCode) });
				resolve({ exitCode, stdout, stderr, durationMs: Date.now() - startTime });
			});
		});
	}

	cancel(): void {
		this.abortController?.abort();
	}
}

export function createRunnerFactory() {
	return function runnerFactory(project: LiquibaseProject): CommandRunner {
		let strategy: IRunStrategy;
		switch (project.resolvedStrategy) {
			case 'gradle':
				strategy = new GradleStrategy();
				break;
			case 'cli':
				strategy = new CliStrategy();
				break;
			default:
				strategy = new MavenStrategy();
		}
		return new CommandRunner(strategy);
	};
}
