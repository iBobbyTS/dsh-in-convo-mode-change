window.__ModuleLoader__.load({
	id: "dsh-in-convo-mode-change",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		// \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		let react = require("react");
		react = __toESM(react, 1);
		// src/client-contract.ts
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		// src/client.ts
		var Menu = primitives.Menu;
		var Toast = primitives.Toast;
		var PresetIcon = primitives.IconAgentPresetOutlineRegular;
		var ChevronIcon = primitives.IconChevronDownOutlineRegular;
		var WarningIcon = primitives.IconWarningOutlineRegular;
		var BUILTIN = {
			standard: "Standard",
			ptc: "Ptc",
			minimal: "Minimal",
			cordis: "Cordis"
		};
		var CSS = [
			".dcm-root { min-width: 54px; max-width: 100%; }",
			".dcm-trigger { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: min(100%, 240px); min-height: 28px; padding: 0 8px; border: none; border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; font-weight: 500; white-space: nowrap; cursor: pointer; }",
			"@media (hover: hover) { .dcm-trigger:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover); } }",
			".dcm-trigger[aria-expanded=\"true\"] { background: var(--dsw-alias-interactive-bg-hover); }",
			".dcm-trigger:disabled { cursor: default; color: var(--dsw-alias-label-quaternary); }",
			".dcm-icon { flex: none; color: var(--dsw-alias-label-primary); }",
			".dcm-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
			".dcm-pending { flex: none; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-caption); font-size: 11px; line-height: 18px; font-weight: 400; }",
			".dcm-chevron { flex: none; color: var(--dsw-alias-label-caption); }",
			".dcm-item { display: flex; flex-direction: column; gap: 2px; max-width: 280px; }",
			".dcm-itemName { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }",
			".dcm-itemDesc { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-caption); white-space: normal; }"
		].join("\n");
		var state = {
			open: false,
			sessionId: void 0,
			options: [],
			busy: false,
			loading: false,
			error: null,
			errorSession: void 0,
			errorSeq: 0,
			pendingBySession: {}
		};
		var listeners = /* @__PURE__ */ new Set();
		function subscribe(fn) {
			listeners.add(fn);
			return function() {
				listeners.delete(fn);
			};
		}
		function mutate(patch) {
			Object.assign(state, patch);
			for (var listener of [...listeners]) listener();
		}
		function apply(ctx) {
			var locale = ctx.get("locale");
			var t = locale.bind("settings.agentPreset");
			function L(zh, en) {
				return locale.resolveText({
					zh,
					en
				});
			}
			function subscribeLocale(fn) {
				return locale.subscribe(fn);
			}
			function localeSnapshot() {
				return locale.getSnapshot();
			}
			function presetText(option) {
				var suffix = BUILTIN[option.id];
				return suffix !== void 0 ? {
					name: t("preset" + suffix + "Name"),
					description: t("preset" + suffix + "Description")
				} : {
					name: option.name || option.id,
					description: option.description
				};
			}
			var style = document.createElement("style");
			style.textContent = CSS;
			document.head.appendChild(style);
			function closeMenu() {
				mutate({ open: false });
			}
			function setPending(sessionId, presetId) {
				var next = Object.assign({}, state.pendingBySession);
				if (presetId === null) delete next[sessionId];
				else next[sessionId] = presetId;
				mutate({ pendingBySession: next });
			}
			function showError(sessionId, error) {
				mutate({
					open: false,
					loading: false,
					error,
					errorSession: sessionId,
					errorSeq: state.errorSeq + 1
				});
			}
			async function loadRoster(sessionId) {
				var remote = ctx.get("remote");
				if (!remote || !remote.agentPresets) {
					showError(sessionId, L("模式目录不可用", "Preset catalog unavailable"));
					return;
				}
				mutate({
					loading: true,
					options: []
				});
				try {
					var response = await remote.agentPresets.list();
					if (!state.open || state.sessionId !== sessionId) return;
					if (!response.ok) return showError(sessionId, response.error.message);
					var options = response.value.presets.filter(function(p) {
						return p.broken === void 0;
					}).map(function(p) {
						return {
							id: p.id,
							name: p.name,
							description: p.description
						};
					});
					if (options.length === 0) return showError(sessionId, L("暂无可用模式", "No presets available"));
					mutate({
						options,
						loading: false
					});
				} catch (err) {
					if (state.open && state.sessionId === sessionId) showError(sessionId, err instanceof Error ? err.message : String(err));
				} finally {
					if (state.sessionId === sessionId) mutate({ loading: false });
				}
			}
			function openMenu(sessionId) {
				mutate({
					open: true,
					sessionId,
					error: null
				});
				loadRoster(sessionId);
			}
			async function selectPreset(sessionId, id) {
				if (state.busy || state.sessionId !== sessionId) return;
				var remote = ctx.get("remote");
				if (!remote || !remote.commands) {
					showError(sessionId, L("命令服务不可用", "Command service unavailable"));
					return;
				}
				if (typeof id !== "string" || !id.trim() || /[\r\n]/.test(id) || !state.options.some(function(p) {
					return p.id === id;
				})) {
					showError(sessionId, L("模式 ID 无效", "Invalid preset id"));
					return;
				}
				mutate({
					open: false,
					busy: true,
					error: null
				});
				setPending(sessionId, id);
				try {
					var result = await remote.commands.execute(sessionId, "/convo-mode " + id, []);
					if (!result.ok) throw new Error(result.error.message);
					if (result.value === void 0) throw new Error(L("Host 中尚未加载切换命令", "Host mode-switch command not installed"));
					if (result.value.result.kind !== "success") throw new Error(result.value.result.text || L("模式切换失败", "Mode switch failed"));
					if (!(result.value.result.text || "").startsWith("Queued preset switch to ") && state.pendingBySession[sessionId] === id) setPending(sessionId, null);
				} catch (err) {
					if (state.pendingBySession[sessionId] === id) setPending(sessionId, null);
					showError(sessionId, err instanceof Error ? err.message : String(err));
				} finally {
					mutate({ busy: false });
				}
			}
			function ModeSwitchAction(props) {
				react.useSyncExternalStore(subscribeLocale, localeSnapshot);
				var snapshotPair = react.useState(state);
				var snap = snapshotPair[0];
				var setSnap = snapshotPair[1];
				react.useEffect(function() {
					return subscribe(function() {
						setSnap(Object.assign({}, state));
					});
				}, []);
				var entry = props.useSessions(function(s) {
					return s.byId[props.sessionId];
				});
				var value = entry && entry.projectionValues?.agentPreset;
				var current = typeof value === "string" ? value : void 0;
				react.useEffect(function() {
					if (state.open && state.sessionId !== props.sessionId) closeMenu();
				}, [props.sessionId, snap.open]);
				react.useEffect(function() {
					if (state.pendingBySession[props.sessionId] === current) setPending(props.sessionId, null);
				}, [props.sessionId, current]);
				if (current === void 0) return null;
				var label = presetText(snap.options.find(function(p) {
					return p.id === current;
				}) || { id: current }).name;
				var pendingId = snap.pendingBySession[props.sessionId];
				var pendingOption = snap.options.find(function(p) {
					return p.id === pendingId;
				});
				var pendingName = pendingId ? presetText(pendingOption || { id: pendingId }).name : "";
				var open = snap.open && snap.sessionId === props.sessionId && snap.options.length > 0;
				var items = snap.options.map(function(option) {
					var copy = presetText(option);
					return {
						id: option.id,
						disabled: snap.busy,
						label: react.createElement("span", { className: "dcm-item" }, react.createElement("span", { className: "dcm-itemName" }, copy.name), react.createElement("span", { className: "dcm-itemDesc" }, copy.description || t("noDescription")))
					};
				});
				var anchor = react.createElement("button", {
					type: "button",
					className: "dcm-trigger",
					"aria-haspopup": "menu",
					"aria-expanded": open,
					disabled: snap.busy,
					title: pendingId ? L("已排队，Agent 空闲后切换到：", "Queued for the next idle boundary: ") + pendingName : L("切换对话模式", "Switch conversation mode"),
					onClick: function() {
						if (snap.open) closeMenu();
						else openMenu(props.sessionId);
					}
				}, react.createElement(PresetIcon, { className: "dcm-icon" }), react.createElement("span", { className: "dcm-name" }, label), react.createElement(ChevronIcon, { className: "dcm-chevron" }), pendingId && react.createElement("span", { className: "dcm-pending" }, L("待切换：", "Pending: ") + pendingName));
				var menu = react.createElement(Menu, {
					open,
					onClose: closeMenu,
					items,
					selectedId: current,
					align: "start",
					portal: true,
					className: "dcm-root",
					anchor,
					onSelect: function(id) {
						if (snap.busy || id === current && !pendingId) return closeMenu();
						selectPreset(props.sessionId, id);
					}
				});
				var error = snap.error !== null && snap.errorSession === props.sessionId ? react.createElement(Toast, {
					key: snap.errorSeq,
					text: snap.error,
					icon: react.createElement(WarningIcon, null),
					holdMs: 8e3,
					onDone: function() {
						if (state.errorSeq === snap.errorSeq) mutate({ error: null });
					}
				}) : null;
				return react.createElement(react.Fragment, null, menu, error);
			}
			var disposers = [];
			var remoteEvents = ctx.get("remote");
			if (remoteEvents && typeof remoteEvents.$on === "function") {
				disposers.push(remoteEvents.$on("agent-preset/selected", function(sessionId, id) {
					if (state.pendingBySession[sessionId] === id) setPending(sessionId, null);
				}));
				disposers.push(remoteEvents.$on("api-session/error", function(sessionId, message) {
					if (typeof message !== "string" || !message.startsWith("[convo-mode] ")) return;
					var pendingId = state.pendingBySession[sessionId];
					if (pendingId === void 0 || !message.startsWith("[convo-mode] Could not switch to " + pendingId + ":")) return;
					setPending(sessionId, null);
					showError(sessionId, message.slice(13));
				}));
				disposers.push(remoteEvents.$on("api-session/removed", function(sessionId) {
					if (state.pendingBySession[sessionId] !== void 0) setPending(sessionId, null);
				}));
			}
			var slots = ctx.get("slots");
			if (slots !== void 0) disposers.push(ctx.effect(function() {
				return slots.inject("conversation.session.header.actions", function() {
					return slots.register({
						name: "conversation.session.header.actions",
						id: "agent-preset",
						priority: -10,
						order: -10
					}, ModeSwitchAction);
				});
			}));
			return function() {
				for (var i = 0; i < disposers.length; i++) try {
					disposers[i]();
				} catch (_) {}
				if (style.parentNode) style.parentNode.removeChild(style);
			};
		}
		const inject = [
			"slots",
			"remote",
			"remote.agentPresets",
			"remote.commands",
			"locale"
		];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map