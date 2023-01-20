import { currentPageContext } from "@src/renderer/state.js";
import {
	batch,
	createEffect,
	createResource,
	createSignal,
	JSXElement,
	Resource,
} from "solid-js";
import type { EditorRouteParams, EditorSearchParams } from "./types.js";
import { http, raw } from "@inlang/git-sdk/api";
import { clientSideEnv } from "@env";
import {
	Config as InlangConfig,
	EnvironmentFunctions,
	initialize$import,
} from "@inlang/core/config";
import { createStore } from "solid-js/store";
import type * as ast from "@inlang/core/ast";
import { Result } from "@inlang/core/utilities";
import type { LocalStorageSchema } from "@src/services/local-storage/schema.js";
import {
	getLocalStorage,
	useLocalStorage,
} from "@src/services/local-storage/index.js";
import { createFsFromVolume, Volume } from "memfs";
import {
	isCollaborator,
	repositoryInformation as _repositoryInformation,
} from "@src/services/github/index.js";
/**
 * `<StateProvider>` initializes state with a computations such resources.
 *
 * Otherwise, the resources would be created with no root element.
 * See https://www.solidjs.com/docs/latest/api#createroot. Avoiding
 * to use Context https://www.solidjs.com/tutorial/stores_context
 * for simplicity.
 */
export function StateProvider(props: { children: JSXElement }) {
	const [localStorage] = useLocalStorage();

	// re-fetched if currentPageContext changes
	[repositoryIsCloned] = createResource(() => {
		return {
			routeParams: currentPageContext.routeParams as EditorRouteParams,
			user: localStorage.user,
		};
	}, cloneRepository);

	// re-fetched if respository has been cloned
	[inlangConfig] = createResource(() => {
		if (repositoryIsCloned.error) {
			return false;
		}
		return repositoryIsCloned();
	}, readInlangConfig);
	// re-fetched if the file system changes
	[unpushedChanges] = createResource(
		// using batch does not work for this resource. don't know why.
		// no related bug so far, hence leave it as is.
		() => {
			if (repositoryIsCloned.error) {
				return false;
			}
			return {
				repositoryClonedTime: repositoryIsCloned()!,
				lastPushTime: lastPush(),
				// while unpushed changes does not require last fs change,
				// unpushed changed should react to fsChange. Hence, pass
				// the signal to _unpushedChanges
				lastFsChange: fsChange(),
			};
		},
		_unpushedChanges
	);

	[userIsCollaborator] = createResource(
		/**
		 *CreateRresource is not reacting to changes like: "false","Null", or "undefined".
		 * Hence, a string needs to be passed to the fetch of the resource.
		 */
		() => ({
			user: localStorage.user ?? "not logged in",
			routeParams: currentPageContext.routeParams as EditorRouteParams,
		}),
		async (args) => {
			if (typeof args.user === "string") {
				return false;
			}
			const response = await isCollaborator({
				owner: args.routeParams.owner,
				repository: args.routeParams.repository,
				username: args.user.username,
			});
			return response;
		}
	);

	[repositoryInformation] = createResource(
		() => {
			if (localStorage.user === undefined) {
				return false;
			} else if (
				currentPageContext.routeParams.owner === undefined ||
				currentPageContext.routeParams.repository === undefined
			) {
				return false;
			}
			return {
				user: localStorage.user,
				routeParams: currentPageContext.routeParams,
			};
		},
		async (args) =>
			_repositoryInformation({
				owner: args.routeParams.owner,
				repository: args.routeParams.repository,
			})
	);

	[currentBranch] = createResource(
		() => {
			if (repositoryIsCloned.error) {
				return false;
			}
			return repositoryIsCloned();
		},
		async () => {
			const branch = await raw.currentBranch({
				fs,
			});
			return branch ?? undefined;
		}
	);

	// if the config is loaded, read the resources
	//! will lead to weird ux since this effect does not
	//! account for user intent
	createEffect(async () => {
		const config = inlangConfig();
		if (config === undefined) {
			return;
		}
		// setting the origin store because this should not trigger
		// writing to the filesystem.
		setOriginResources(await readResources(config));
	});

	return props.children;
}

export let unpushedChanges: Resource<Awaited<ReturnType<typeof raw.log>>>;

/**
 * Whether a repository is cloned and when it was cloned.
 *
 * The value is `false` if the repository is not cloned. Otherwise,
 * a Date is provided that reflects the time of when the repository
 * was cloned.
 */
export let repositoryIsCloned: Resource<undefined | Date>;

/**
 * The current branch.
 */
export let currentBranch: Resource<string | undefined>;

/**
 * The current inlang config.
 *
 * Undefined if no inlang config exists/has been found.
 */
export let inlangConfig: Resource<InlangConfig | undefined>;

export let repositoryInformation: Resource<any>;

/**
 * Route parameters like `/github.com/inlang/website`.
 */
export const routeParams = () =>
	currentPageContext.routeParams as EditorRouteParams;

/**
 * Search parameters of editor route like `?branch=main`.
 */
export const searchParams = () =>
	currentPageContext.urlParsed.search as EditorSearchParams;

/**
 * The filesystem is not reactive, hence setFsChange to manually
 * trigger re-renders.
 *
 * setFsChange manually to `Date.now()`
 */
export const [fsChange, setFsChange] = createSignal(new Date());

export const [filteredLanguages, setFilteredLanguages] = createSignal<string[]>(
	[]
);

export { resources, setResources };

/**
 * The resources.
 *
 * Read below why the setter function is called setOrigin.
 */
const [resources, setOriginResources] = createStore<ast.Resource[]>([]);

/**
 * Custom setStore function to trigger filesystem writes on changes.
 *
 * Listening to changes on an entire store is not possible, see
 * https://github.com/solidjs/solid/discussions/829. A workaround
 * (which seems much better than effects anyways) is to modify the
 * setStore function to trigger the desired side-effect.
 */
const setResources: typeof setOriginResources = (...args: any) => {
	// @ts-ignore
	setOriginResources(...args);
	const localStorage = getLocalStorage();
	const config = inlangConfig();
	if (config === undefined || localStorage?.user === undefined) {
		return;
	}
	// write to filesystem

	writeResources(
		config,
		// ...args are the resources
		// @ts-ignore
		...args,
		localStorage.user
	);
};

/**
 * The reference resource.
 */
export const referenceResource = () =>
	resources.find(
		(resource) =>
			resource.languageTag.language === inlangConfig()?.referenceLanguage
	);

/**
 *  Date of the last push to the Repo
 */
const [lastPush, setLastPush] = createSignal<Date>();
/**
 * whether or not if the user is a collaborator of this Repo
 *
 * when using this function, whether the user is logged in
 * @example
 * 	if (user && isCollaborator())
 */
export let userIsCollaborator: Resource<boolean>;
// ------------------------------------------

/**
 * In memory filesystem.
 *
 * Must be re-initialized on every cloneRepository call.
 */
let fs: typeof import("memfs").fs;

async function cloneRepository(args: {
	routeParams: EditorRouteParams;
	user: LocalStorageSchema["user"];
}): Promise<Date | undefined> {
	// reassgining (resetting) fs.
	fs = createFsFromVolume(new Volume());
	const { host, owner, repository } = args.routeParams;
	if (host === undefined || owner === undefined || repository === undefined) {
		return undefined;
	}
	await raw.clone({
		fs: fs,
		http,
		dir: "/",
		corsProxy: clientSideEnv.VITE_GIT_REQUEST_PROXY_PATH,
		url: `https://${host}/${owner}/${repository}`,
	});
	// triggering a side effect here to trigger a re-render
	// of components that depends on fs
	const date = new Date();
	setFsChange(date);
	return date;
}

/**
 * Pushed changes and pulls right afterwards.
 */
export async function pushChanges(
	routeParams: EditorRouteParams,
	user: NonNullable<LocalStorageSchema["user"]>
): Promise<Result<void, Error>> {
	const { host, owner, repository } = routeParams;
	if (host === undefined || owner === undefined || repository === undefined) {
		return Result.err(Error("h3ni329 Invalid route params"));
	}
	const args = {
		fs: fs,
		http,
		dir: "/",
		author: {
			name: user.username,
		},
		corsProxy: clientSideEnv.VITE_GIT_REQUEST_PROXY_PATH,
		url: `https://${host}/${owner}/${repository}`,
	};
	try {
		// pull changes before pushing
		// https://github.com/inlang/inlang/issues/250
		const _pull = await pull({ user: user });
		if (_pull.isErr) {
			return Result.err(
				Error("Failed to pull: " + _pull.error.message, { cause: _pull.error })
			);
		}
		const push = await raw.push(args);
		if (push.ok === false) {
			return Result.err(Error("Failed to push", { cause: push.error }));
		}
		await raw.pull(args);
		const time = new Date();
		// triggering a rebuild of everything fs related
		setFsChange(time);
		setLastPush(time);
		return Result.ok(undefined);
	} catch (error) {
		return Result.err((error as Error) ?? "h3ni329 Unknown error");
	}
}

async function readInlangConfig(): Promise<InlangConfig | undefined> {
	try {
		const environmentFunctions: EnvironmentFunctions = {
			$import: initialize$import({
				workingDirectory: "/",
				fs: fs.promises,
				fetch,
			}),
			$fs: fs.promises,
		};
		const file = await fs.promises.readFile("./inlang.config.js", "utf-8");
		const withMimeType =
			"data:application/javascript;base64," + btoa(file.toString());

		const module = await import(/* @vite-ignore */ withMimeType);
		const initialized: InlangConfig = await module.initializeConfig({
			...environmentFunctions,
		});

		//initialises/ set the inital signal for  the language of the language filter for the messages
		setFilteredLanguages(initialized.languages);
		return initialized;
	} catch (error) {
		if ((error as Error).message.includes("ENOENT")) {
			// the config does not exist
			return undefined;
		} else {
			throw error;
		}
	}
}

async function readResources(config: InlangConfig) {
	const resources = await config.readResources({ config });
	return resources;
}

async function writeResources(
	config: InlangConfig,
	resources: ast.Resource[],
	user: NonNullable<LocalStorageSchema["user"]>
) {
	await config.writeResources({ config, resources });
	const status = await raw.statusMatrix({ fs, dir: "/" });
	const filesWithUncomittedChanges = status.filter(
		// files with unstaged and uncomitted changes
		(row) => row[2] === 2 && row[3] === 1
	);
	// add all changes
	for (const file of filesWithUncomittedChanges) {
		await raw.add({ fs, dir: "/", filepath: file[0] });
	}
	// commit changes
	await raw.commit({
		fs,
		dir: "/",
		author: {
			name: user.username,
		},
		message: "inlang: update translations",
	});
	// triggering a side effect here to trigger a re-render
	// of components that depends on fs
	setFsChange(new Date());
}

async function _unpushedChanges(args: {
	repositoryClonedTime: Date;
	lastPushTime?: Date;
}) {
	if (args.repositoryClonedTime === undefined) {
		return [];
	}
	const unpushedChanges = await raw.log({
		fs,
		dir: "/",
		since: args.lastPushTime ? args.lastPushTime : args.repositoryClonedTime,
	});
	return unpushedChanges;
}

async function pull(args: { user: NonNullable<LocalStorageSchema["user"]> }) {
	try {
		await raw.pull({
			fs,
			http,
			dir: "/",
			corsProxy: clientSideEnv.VITE_GIT_REQUEST_PROXY_PATH,
			singleBranch: true,
			author: {
				name: args.user.username,
			},
			// try to not create a merge commit
			// rebasing would be the best option but it is not supported by isomorphic-git
			// a switch to https://libgit2.org/ seems unavoidable
			fastForward: true,
		});
		const time = new Date();
		// triggering a rebuild of everything fs related
		setFsChange(time);
		return Result.ok(undefined);
	} catch (error) {
		return Result.err(error as Error);
	}
}