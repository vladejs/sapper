import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import create_routes from './create_routes';
import { posixify, write_if_changed } from './utils';
import { dev, locations } from '../config';
import { Route } from '../interfaces';

export function create_main_manifests({ routes, dev_port }: {
	routes: Route[];
	dev_port?: number;
}) {
	const path_to_routes = path.relative(`${locations.app()}/manifest`, locations.routes());

	const client_manifest = generate_client(routes, path_to_routes, dev_port);
	const server_manifest = generate_server(routes, path_to_routes);

	write_if_changed(`${locations.app()}/manifest/client.js`, client_manifest);
	write_if_changed(`${locations.app()}/manifest/server.js`, server_manifest);
}

export function create_serviceworker_manifest({ routes, client_files }: {
	routes: Route[];
	client_files: string[];
}) {
	const assets = glob.sync('**', { cwd: 'assets', nodir: true });

	let code = `
		// This file is generated by Sapper — do not edit it!
		export const timestamp = ${Date.now()};

		export const assets = [\n\t${assets.map((x: string) => `"${x}"`).join(',\n\t')}\n];

		export const shell = [\n\t${client_files.map((x: string) => `"${x}"`).join(',\n\t')}\n];

		export const routes = [\n\t${routes.filter((r: Route) => r.type === 'page' && !/^_[45]xx$/.test(r.id)).map((r: Route) => `{ pattern: ${r.pattern} }`).join(',\n\t')}\n];
	`.replace(/^\t\t/gm, '').trim();

	write_if_changed(`${locations.app()}/manifest/service-worker.js`, code);
}

function generate_client(routes: Route[], path_to_routes: string, dev_port?: number) {
	let code = `
		// This file is generated by Sapper — do not edit it!
		export const routes = [
			${routes
				.map(route => {
					const page = route.handlers.find(({ type }) => type === 'page');

					if (!page) {
						return `{ pattern: ${route.pattern}, ignore: true }`;
					}

					const file = posixify(`${path_to_routes}/${page.file}`);

					if (route.id === '_4xx' || route.id === '_5xx') {
						return `{ error: '${route.id.slice(1)}', load: () => import(/* webpackChunkName: "${route.id}" */ '${file}') }`;
					}

					const params = route.params.length === 0
						? '{}'
						: `{ ${route.params.map((part, i) => `${part}: match[${i + 1}]`).join(', ')} }`;

					return `{ pattern: ${route.pattern}, params: ${route.params.length > 0 ? `match` : `()`} => (${params}), load: () => import(/* webpackChunkName: "${route.id}" */ '${file}') }`;
				})
				.join(',\n\t')}
		];`.replace(/^\t\t/gm, '').trim();

	if (dev()) {
		const sapper_dev_client = posixify(
			path.resolve(__dirname, '../sapper-dev-client.js')
		);

		code += `

			if (module.hot) {
				import('${sapper_dev_client}').then(client => {
					client.connect(${dev_port});
				});
			}`.replace(/^\t{3}/gm, '');
	}

	return code;
}

function generate_server(routes: Route[], path_to_routes: string) {
	let code = `
		// This file is generated by Sapper — do not edit it!
		${routes
			.map(route =>
				route.handlers
					.map(({ type, file }, index) => {
						const module = posixify(`${path_to_routes}/${file}`);

						return type === 'page'
							? `import ${route.id}${index} from '${module}';`
							: `import * as ${route.id}${index} from '${module}';`;
					})
					.join('\n')
			)
			.join('\n')}

		export const routes = [
			${routes
				.map(route => {
					const handlers = route.handlers
						.map(({ type }, index) =>
							`{ type: '${type}', module: ${route.id}${index} }`)
						.join(', ');

					if (route.id === '_4xx' || route.id === '_5xx') {
						return `{ error: '${route.id.slice(1)}', handlers: [${handlers}] }`;
					}

					const params = route.params.length === 0
						? '{}'
						: `{ ${route.params.map((part, i) => `${part}: match[${i + 1}]`).join(', ')} }`;

					return `{ id: '${route.id}', pattern: ${route.pattern}, params: ${route.params.length > 0 ? `match` : `()`} => (${params}), handlers: [${handlers}] }`;
				})
				.join(',\n\t')
			}
		];`.replace(/^\t\t/gm, '').trim();

	return code;
}