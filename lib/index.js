// src/index.ts
const name = "dsh-in-convo-mode-change";
const inject = ["commands", "agentPresets"];
const QUEUED = "Queued preset switch to ";
function errorText(error) {
	return error instanceof Error ? error.message : String(error);
}
function apply(ctx) {
	const pending = /* @__PURE__ */ new Map();
	const generations = /* @__PURE__ */ new Map();
	const active = /* @__PURE__ */ new Set();
	const retrying = /* @__PURE__ */ new Set();
	let disposed = false;
	const presets = ctx.get("agentPresets");
	function reportFailure(agent, id, error) {
		const message = "[convo-mode] Could not switch to " + id + ": " + errorText(error);
		try {
			ctx.emit("api-session/error", agent.id, message);
		} catch (notifyError) {
			ctx.logger?.warn("convo-mode: failure notification failed: " + errorText(notifyError));
		}
		ctx.logger?.warn(message);
	}
	function waitForIdle(agent) {
		if (retrying.has(agent) || disposed) return;
		retrying.add(agent);
		agent.whenIdle().then(() => {
			retrying.delete(agent);
			if (!disposed) drain(agent);
		}, (error) => {
			retrying.delete(agent);
			if (!disposed) {
				const item = pending.get(agent);
				if (item !== void 0) {
					pending.delete(agent);
					reportFailure(agent, item.id, error);
				}
			}
		});
	}
	function drain(agent, notifyDeferred = true) {
		if (disposed || active.has(agent)) return void 0;
		const item = pending.get(agent);
		if (item === void 0 || agent.status !== "idle") return void 0;
		let task;
		try {
			task = agent.runMaintenance(async (signal) => {
				if (signal.aborted) throw new Error("Agent maintenance was cancelled before switching");
				const current = presets.composedPreset(agent.ctx);
				if (current === item.id) return {
					kind: "success",
					text: "Already using " + item.id + "."
				};
				const selected = await presets.recompose(agent.ctx, item.id);
				try {
					agent.session.append("agent-preset/selected", { agentPreset: selected.id });
				} catch (writeError) {
					try {
						await presets.recompose(agent.ctx, current);
					} catch (rollbackError) {
						ctx.logger?.warn("convo-mode: rollback failed: " + errorText(rollbackError));
					}
					throw writeError;
				}
				return {
					kind: "success",
					text: "Switched agent preset to " + selected.id + "."
				};
			});
		} catch (_busy) {
			waitForIdle(agent);
			return;
		}
		pending.delete(agent);
		active.add(agent);
		return task.then((result) => result, (error) => {
			if (notifyDeferred) reportFailure(agent, item.id, error);
			else ctx.logger?.warn("convo-mode: immediate switch failed: " + errorText(error));
			return {
				kind: "error",
				text: errorText(error)
			};
		}).finally(() => {
			active.delete(agent);
			if (!disposed && pending.has(agent)) drain(agent);
		});
	}
	const stopStatus = ctx.on("agent/status", ({ agent, status }) => {
		if (!disposed && status === "idle" && pending.has(agent)) drain(agent);
	});
	const stopDisposed = ctx.on("agent/disposed", ({ agent }) => {
		pending.delete(agent);
		retrying.delete(agent);
		generations.delete(agent);
	});
	const stopCommand = ctx.commands.register({
		name: "convo-mode",
		description: "Switch the Agent preset now, or queue it until the Agent is idle.",
		input: { hint: "<preset-id>" },
		recordInput: false,
		handler: async ({ agent, rawInput, signal }) => {
			const id = rawInput.trim();
			if (!id || /[\r\n]/.test(id)) return {
				kind: "error",
				text: "Specify one agent preset id."
			};
			if (agent.session.header.origin === "subagent") return {
				kind: "error",
				text: "Subagent sessions cannot change preset."
			};
			if (disposed || signal?.aborted) return {
				kind: "error",
				text: "Mode switch was cancelled."
			};
			if (presets === void 0) return {
				kind: "error",
				text: "Agent preset service unavailable."
			};
			const generation = (generations.get(agent) ?? 0) + 1;
			generations.set(agent, generation);
			try {
				const resolved = await presets.resolve(id);
				if (resolved.broken !== void 0) return {
					kind: "error",
					text: "Preset " + id + " is unavailable: " + resolved.broken
				};
			} catch (error) {
				return {
					kind: "error",
					text: errorText(error)
				};
			}
			if (disposed || signal?.aborted) return {
				kind: "error",
				text: "Mode switch was cancelled."
			};
			if (generations.get(agent) !== generation) return {
				kind: "success",
				text: "Superseded by a newer preset selection."
			};
			if (presets.composedPreset(agent.ctx) === id && !active.has(agent)) {
				pending.delete(agent);
				return {
					kind: "success",
					text: "Already using " + id + "."
				};
			}
			pending.set(agent, { id });
			const immediate = drain(agent, false);
			if (immediate !== void 0) return await immediate;
			return {
				kind: "success",
				text: QUEUED + id + " until the Agent becomes idle."
			};
		}
	});
	return function dispose() {
		disposed = true;
		pending.clear();
		generations.clear();
		stopCommand();
		stopStatus();
		stopDisposed();
	};
}
export { apply, inject, name };

//# sourceMappingURL=index.js.map