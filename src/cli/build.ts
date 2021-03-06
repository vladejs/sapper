import * as fs from 'fs';
import * as path from 'path';
import * as clorox from 'clorox';
import mkdirp from 'mkdirp';
import rimraf from 'rimraf';
import { minify_html } from './utils/minify_html';
import { create_compilers, create_main_manifests, create_routes, create_serviceworker_manifest } from '../core'
import { locations } from '../config';

export async function build() {
	const output = locations.dest();

	mkdirp.sync(output);
	rimraf.sync(path.join(output, '**/*'));

	// minify app/template.html
	// TODO compile this to a function? could be quicker than str.replace(...).replace(...).replace(...)
	const template = fs.readFileSync(`${locations.app()}/template.html`, 'utf-8');

	// remove this in a future version
	if (template.indexOf('%sapper.base%') === -1) {
		console.log(`${clorox.bold.red(`> As of Sapper v0.10, your template.html file must include %sapper.base% in the <head>`)}`);
		process.exit(1);
	}

	fs.writeFileSync(`${output}/template.html`, minify_html(template));

	const routes = create_routes();

	// create app/manifest/client.js and app/manifest/server.js
	create_main_manifests({ routes });

	const { client, server, serviceworker } = create_compilers();

	const client_stats = await compile(client);
	console.log(`${clorox.inverse(`\nbuilt client`)}`);
	console.log(client_stats.toString({ colors: true }));
	fs.writeFileSync(path.join(output, 'client_info.json'), JSON.stringify({
		assets: client_stats.toJson().assetsByChunkName
	}));

	const server_stats = await compile(server);
	console.log(`${clorox.inverse(`\nbuilt server`)}`);
	console.log(server_stats.toString({ colors: true }));

	let serviceworker_stats;

	if (serviceworker) {
		create_serviceworker_manifest({
			routes,
			client_files: client_stats.toJson().assets.map((chunk: { name: string }) => `client/${chunk.name}`)
		});

		serviceworker_stats = await compile(serviceworker);
		console.log(`${clorox.inverse(`\nbuilt service worker`)}`);
		console.log(serviceworker_stats.toString({ colors: true }));
	}
}

function compile(compiler: any) {
	return new Promise((fulfil, reject) => {
		compiler.run((err: Error, stats: any) => {
			if (err) {
				reject(err);
				process.exit(1);
			}

			if (stats.hasErrors()) {
				console.error(stats.toString({ colors: true }));
				reject(new Error(`Encountered errors while building app`));
			}

			else {
				fulfil(stats);
			}
		});
	});
}
