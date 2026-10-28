import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {setup, stubStorage} from './test-helpers';

const POD = 'robinj-be-website-7c9d8f6b5d-q8zrm';
const OTHER_POD = 'robinj-be-website-7c9d8f6b5d-x2k4p';
const FORBIDDEN = 'Error from server (Forbidden):';

beforeEach(() => {
	stubStorage();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('kubectl', () => {
	it('shows its help, and only knows the one context', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl | head -1')).toBe('kubectl controls the Kubernetes cluster manager.');
		expect(await run('kubectl --context=elsewhere get pods')).toBe('error: context was not found for specified context: elsewhere');
		expect(shell.state.status).toBe(1);
		expect(await run('kubectl --context robins-apartment config current-context')).toBe('robins-apartment');
		expect(await run('kubectl bogus')).toBe('error: unknown command "bogus" for "kubectl"');
		expect(shell.state.status).toBe(1);
	});

	it('prints versions, the cluster\'s address and its API versions', async () => {
		const session = setup();

		expect(await session.run('kubectl version')).toBe('Client Version: v1.37.1\nKustomize Version: v5.7.1\nServer Version: v1.37.1');
		expect(await session.run('kubectl version --client')).toBe('Client Version: v1.37.1\nKustomize Version: v5.7.1');
		expect(await session.run('kubectl api-versions | head -2')).toBe('admissionregistration.k8s.io/v1\napps/v1');
		expect(await session.run('kubectl events')).toBe('No events found in default namespace.');

		await session.shell.execute('kubectl cluster-info');
		expect(session.tty.take({codes: true})).toBe("\x1b[0;32mKubernetes control plane\x1b[0m is running at \x1b[0;33mhttps://192.168.1.42:6443\x1b[0m\n\nTo further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.\n");
		expect(await session.run('kubectl cluster-info | head -1')).toBe('Kubernetes control plane is running at https://192.168.1.42:6443');
	});
});

describe('kubectl get', () => {
	it('lists several types at once, each with its kind', async () => {
		const {run} = setup();

		expect(await run('kubectl get po,svc')).toMatch(new RegExp([
			'^NAME +READY +STATUS +RESTARTS +AGE',
			`pod/${POD} +1/1 +Running +0 +\\d+m`,
			`pod/${OTHER_POD} +1/1 +Running +0 +\\d+m`,
			'',
			'NAME +TYPE +CLUSTER-IP +EXTERNAL-IP +PORT\\(S\\) +AGE',
			'service/kubernetes +ClusterIP +10\\.96\\.0\\.1 +<none> +443/TCP +412d',
			'service/robinj-be-website +ClusterIP +10\\.96\\.142\\.37 +<none> +80/TCP +47d$',
		].join('\\n')));
	});

	it('lists everything the website is made of with "all"', async () => {
		const {run} = setup();

		expect((await run('kubectl get all')).split('\n').filter(line => /^\w/.test(line) && !line.startsWith('NAME')).map(line => line.split(/\s+/)[0])).toEqual([
			`pod/${POD}`, `pod/${OTHER_POD}`, 'service/kubernetes', 'service/robinj-be-website', 'deployment.apps/robinj-be-website',
			'replicaset.apps/robinj-be-website-7c9d8f6b5d', 'replicaset.apps/robinj-be-website-5f8b9c7d4f', 'horizontalpodautoscaler.autoscaling/robinj-be-website',
		]);
	});

	it('adds columns with -o wide, and a namespace with -A', async () => {
		const {run} = setup();

		expect(await run('kubectl get pods -o wide')).toMatch(new RegExp(`^NAME +READY +STATUS +RESTARTS +AGE +IP +NODE +NOMINATED NODE +READINESS GATES\\n${POD} +1/1 +Running +0 +\\d+m +10\\.244\\.0\\.17 +homelab-01 +<none> +<none>\\n`));
		expect(await run('kubectl get deploy -o wide')).toMatch(/website +ghcr\.io\/robinj1995\/robinj\.be\/website:20261027171221361edc +app=robinj-be-website$/);
		expect(await run('kubectl get rs -o wide | tail -1')).toMatch(/^robinj-be-website-5f8b9c7d4f +0 +0 +0 +9d +website +\S+ +app=robinj-be-website,pod-template-hash=5f8b9c7d4f$/);
		expect(await run('kubectl get svc --output=wide')).toMatch(/kubernetes .* 412d +<none>\nrobinj-be-website .* 47d +app=robinj-be-website$/);
		expect(await run('kubectl get hpa -o wide')).toMatch(/^NAME +REFERENCE +TARGETS +MINPODS +MAXPODS +REPLICAS +AGE\n/);
		expect(await run('kubectl get pods --all-namespaces')).toMatch(new RegExp(`^NAMESPACE +NAME +READY .*\\ndefault +${POD} `));
		expect(await run('kubectl get nodes -A')).toMatch(/^NAME +STATUS +ROLES +AGE +VERSION\nhomelab-01 +Ready +control-plane +412d +v1\.37\.1$/);
	});

	it('leaves out the headers when asked', async () => {
		const {run} = setup();

		expect(await run('kubectl get ns --no-headers')).toMatch(/^default +Active +412d\nkube-node-lease +Active +412d\nkube-public +Active +412d\nkube-system +Active +412d$/);
	});

	it('names resources with -o name, picked by name or by label', async () => {
		const {run} = setup();

		expect(await run('kubectl get pods -o name')).toBe(`pod/${POD}\npod/${OTHER_POD}`);
		expect(await run(`kubectl get pod/${OTHER_POD} deploy/robinj-be-website -o name`)).toBe(`pod/${OTHER_POD}\ndeployment.apps/robinj-be-website`);
		expect(await run('kubectl get pods,services -l app=robinj-be-website,pod-template-hash=7c9d8f6b5d -o name')).toBe(`pod/${POD}\npod/${OTHER_POD}`);
		expect(await run('kubectl get Deployment.apps robinj-be-website --selector=app=robinj-be-website -o name')).toBe('deployment.apps/robinj-be-website');
	});

	it('prints objects as YAML and JSON, alone or as a list', async () => {
		const {run} = setup();

		expect(await run('kubectl get ns default -o yaml')).toMatch(/^apiVersion: v1\nkind: Namespace\nmetadata:\n {2}labels:\n {4}kubernetes\.io\/metadata\.name: default\n {2}creationTimestamp: "\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ"\n {2}name: default\n {2}resourceVersion: "4209359"\n {2}uid: c0ffee00-0007-4b1d-9e5a-badc0de13370\nspec:\n {2}finalizers:\n {2}- kubernetes\nstatus:\n {2}phase: Active$/);
		expect(await run('kubectl get deploy -o yaml | head -7')).toBe('apiVersion: v1\nitems:\n- apiVersion: apps/v1\n  kind: Deployment\n  metadata:\n    annotations:\n      deployment.kubernetes.io/revision: "14"');
		expect(await run('kubectl get svc kubernetes -o yaml | grep "loadBalancer\\|targetPort"')).toBe('    targetPort: 6443\n  loadBalancer: {}');
		expect(await run('kubectl get deploy -o yaml | tail -3')).toBe('kind: List\nmetadata:\n  resourceVersion: ""');

		const service = JSON.parse(await run('kubectl get svc robinj-be-website -o json'));
		expect(service.spec).toEqual({clusterIP: '10.96.142.37', clusterIPs: ['10.96.142.37'], ports: [{name: 'http', port: 80, protocol: 'TCP', targetPort: 'http'}], selector: {app: 'robinj-be-website'}, type: 'ClusterIP'});
		const pods = JSON.parse(await run('kubectl get pods -o json'));
		expect(pods.items.map(pod => pod.status.podIP)).toEqual(['10.244.0.17', '10.244.0.18']);
	});

	it('says what it did not find', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl get')).toBe('error: you must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.');
		expect(shell.state.status).toBe(1);
		expect(await run('kubectl get bogus')).toBe('error: the server doesn\'t have a resource type "bogus"');
		expect(await run('kubectl get bogus/x')).toBe('error: the server doesn\'t have a resource type "bogus"');
		expect(await run(`kubectl get pods nope ${POD} -o name`)).toBe(`Error from server (NotFound): pods "nope" not found\npod/${POD}`);
		expect(shell.state.status).toBe(1);
		expect(await run('kubectl get pods nope')).toBe('Error from server (NotFound): pods "nope" not found');
		expect(await run('kubectl get pods -l app=nope')).toBe('No resources found in default namespace.');
		expect(shell.state.status).toBe(0);
		expect(await run('kubectl get secrets -n kube-system')).toBe('No resources found in kube-system namespace.');
		expect(await run('kubectl get pods -A -l app=nope')).toBe('No resources found');
		expect(await run('kubectl get nodes -l x=y')).toBe('No resources found');
		expect(await run('kubectl get pods -o table')).toMatch(/^error: unable to match a printer suitable for the output format "table", allowed formats are: /);
		expect(shell.state.status).toBe(1);
	});

	it('watches with -w until interrupted', async () => {
		const {shell, tty} = setup();

		const running = shell.execute('kubectl get deploy --watch');
		await vi.waitFor(() => expect(tty.take()).toMatch(/^NAME +READY/));
		shell.interrupt();
		await running;
		expect(shell.state.status).toBe(130);
	});

	it('gives ages as kubectl does', async () => {
		const {run} = setup();
		const created = Date.parse(JSON.parse(await run(`kubectl get pod ${POD} -o json`)).metadata.creationTimestamp);
		vi.useFakeTimers({toFake: ['Date']});
		const age = async seconds => {
			vi.setSystemTime(created + seconds * 1000 + 999);
			return (await run(`kubectl get pod ${POD} --no-headers`)).split(/\s+/).pop();
		};
		const MINUTE = 60;
		const HOUR = 60 * MINUTE;
		const DAY = 24 * HOUR;

		expect(await age(30)).toBe('30s');
		expect(await age(119)).toBe('119s');
		expect(await age(5 * MINUTE + 7)).toBe('5m7s');
		expect(await age(5 * MINUTE)).toBe('5m');
		expect(await age(42 * MINUTE)).toBe('42m');
		expect(await age(3 * HOUR + 20 * MINUTE)).toBe('3h20m');
		expect(await age(3 * HOUR)).toBe('3h');
		expect(await age(20 * HOUR)).toBe('20h');
		expect(await age(3 * DAY + 4 * HOUR)).toBe('3d4h');
		expect(await age(3 * DAY)).toBe('3d');
		expect(await age(100 * DAY)).toBe('100d');
		expect(await age(800 * DAY)).toBe('2y70d');
		expect(await age(730 * DAY)).toBe('2y');
	});
});

describe('kubectl describe', () => {
	it('describes pods, deployments and the autoscaler', async () => {
		const {run} = setup();

		expect(await run(`kubectl describe pod/${POD} | head -8`)).toMatch(new RegExp(`^Name: {13}${POD}\\nNamespace: {8}default\\nPriority: {9}0\\nService Account: {2}default\\nNode: {13}homelab-01/192\\.168\\.1\\.42\\nStart Time: {7}\\w{3}, \\d\\d \\w{3} \\d{4} \\d\\d:\\d\\d:\\d\\d \\+0000\\nLabels: {11}app=robinj-be-website\\n {18}pod-template-hash=7c9d8f6b5d$`));
		expect(await run('kubectl describe deploy | grep ^Replicas:')).toBe('Replicas:               2 desired | 2 updated | 2 total | 2 available | 0 unavailable');
		expect(await run('kubectl describe hpa robinj-be-website | grep "resource cpu"')).toBe('  resource cpu on pods  (as a percentage of request):  42% (21m) / 70%');
	});

	it('describes services, with their endpoints', async () => {
		const {run} = setup();

		expect(await run('kubectl describe svc kubernetes | grep "Selector\\|Endpoints"')).toBe('Selector:                 <none>\nEndpoints:                192.168.1.42:6443');
		expect(await run('kubectl describe svc robinj-be-website | grep Endpoints')).toBe('Endpoints:                10.244.0.17:80,10.244.0.18:80');
		expect(await run('kubectl describe svc robinj-be-website | grep Selector')).toBe('Selector:                 app=robinj-be-website');
	});

	it('describes the node, namespaces and replica sets', async () => {
		const {run} = setup();

		expect(await run('kubectl describe no | head -6')).toBe('Name:              homelab-01\nRoles:             control-plane\nLabels:            kubernetes.io/arch=riscv64\n                   kubernetes.io/hostname=homelab-01\n                   kubernetes.io/os=linux\n                   node-role.kubernetes.io/control-plane=');
		expect(await run('kubectl describe no | grep -c "  default  "')).toBe('2');
		expect(await run('kubectl describe ns default')).toBe('Name:         default\nLabels:       kubernetes.io/metadata.name=default\nAnnotations:  <none>\nStatus:       Active\n\nNo resource quota.\n\nNo LimitRange resource.');
		expect(await run('kubectl describe ns | grep -c ^Name:')).toBe('4');
		expect(await run('kubectl describe rs robinj-be-website-5f8b9c7d4f | grep Replicas')).toBe('Replicas:       0 current / 0 desired');
	});

	it('aligns a replica set\'s fields after its longest label', async () => {
		const {run} = setup();

		expect(await run('kubectl describe rs robinj-be-website-7c9d8f6b5d | grep "^Controlled\\|^Events\\|^Name:"')).toBe('Name:           robinj-be-website-7c9d8f6b5d\nControlled By:  Deployment/robinj-be-website\nEvents:         <none>');
	});

	it('separates several objects, and says what it did not find', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl describe pods | grep -c ^Name:')).toBe('2');
		expect(await run('kubectl describe')).toBe('error: you must specify the type of resource to describe. Use "kubectl api-resources" for a complete list of supported resources.');
		expect(await run('kubectl describe pods nope')).toBe('Error from server (NotFound): pods "nope" not found');
		expect(shell.state.status).toBe(1);
		expect(await run('kubectl describe secrets')).toBe('No resources found in default namespace.');
		expect(await run('kubectl describe pods -n kube-system')).toBe('No resources found in kube-system namespace.');
		expect(shell.state.status).toBe(0);
	});
});

describe('kubectl logs', () => {
	it('needs a pod, a workload or a selector', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl logs')).toBe("error: expected 'logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER]'.\nPOD or TYPE/NAME is a required argument for the logs command\nSee 'kubectl logs -h' for help and examples");
		expect(shell.state.status).toBe(1);
		expect(await run('kubectl logs nope')).toBe('Error from server (NotFound): pods "nope" not found');
		expect(await run('kubectl logs bogus/x')).toBe('error: the server doesn\'t have a resource type "bogus"');
		expect(await run('kubectl logs svc/robinj-be-website')).toBe('Error from server (NotFound): services "robinj-be-website" not found');
		expect(await run('kubectl logs deploy/nope')).toBe('Error from server (NotFound): deployments.apps "nope" not found');
		expect(await run('kubectl logs -l app=nope')).toBe('No resources found in default namespace.');
		expect(shell.state.status).toBe(0);
	});

	it('has only one container, and no previous one', async () => {
		const {shell, run} = setup();

		expect(await run(`kubectl logs ${OTHER_POD} -p`)).toBe(`Error from server (BadRequest): previous terminated container "website" in pod "${OTHER_POD}" not found`);
		expect(await run(`kubectl logs ${OTHER_POD} -c sidecar`)).toBe(`error: container sidecar is not valid for pod ${OTHER_POD}`);
		expect(shell.state.status).toBe(1);
		expect(await run(`kubectl logs ${OTHER_POD} --container=website --tail=1`)).toMatch(/"kube-probe\/1\.37" "-"$/);
	});

	it('shows nginx starting, then probes and visitors', async () => {
		const {run} = setup();

		const lines = (await run(`kubectl logs pod/${POD}`)).split('\n');
		expect(lines[0]).toBe('/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration');
		expect(lines[8]).toMatch(/^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d \[notice\] 1#1: nginx\/1\.28\.0$/);
		expect(lines.filter(line => !line.includes('kube-probe')).slice(-4).map(line => line.match(/"GET (\S+) HTTP\/1\.1" (\d+)/).slice(1))).toEqual([
			['/side-quests', '200'], ['/contact', '200'], ['/.env', '404'], [location.pathname, '200'],
		]);
		expect(await run(`kubectl logs ${OTHER_POD} | grep -c wp-login.php`)).toBe('1');
		expect(await run(`kubectl logs ${OTHER_POD} | grep -c '/\\.env'`)).toBe('0');
	});

	it('picks one pod of a deployment, and prefixes lines from several', async () => {
		const {run} = setup();

		expect(await run('kubectl logs deploy/robinj-be-website --tail=0')).toBe(`Found 2 pods, using pod/${POD}`);
		expect(await run('kubectl logs rs/robinj-be-website-7c9d8f6b5d --tail=0')).toBe(`Found 2 pods, using pod/${POD}`);
		const lines = (await run('kubectl logs -l app=robinj-be-website --tail 20')).split('\n');
		expect(lines).toHaveLength(20);
		expect(lines.every(line => line.startsWith(`[pod/${POD}/website] `) || line.startsWith(`[pod/${OTHER_POD}/website] `))).toBe(true);
		expect(new Set(lines.map(line => line.split(' ')[0])).size).toBe(2);
	});

	it('adds timestamps and prefixes when asked', async () => {
		const {run} = setup();

		expect(await run(`kubectl logs ${POD} --timestamps --prefix | head -1`)).toMatch(new RegExp(`^\\[pod/${POD}/website\\] \\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{9}Z /docker-entrypoint\\.sh: `));
	});

	it('takes -f for --follow, not --filename', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup();

		const running = shell.execute(`kubectl logs -f ${POD} --tail=0`);
		await vi.advanceTimersByTimeAsync(5000);
		shell.interrupt();
		await running;
		expect(tty.take()).toMatch(/^10\.244\.0\.1 - - \[[^\]]+\] "GET \/ HTTP\/1\.1" 200 2330 "-" "kube-probe\/1\.37" "-"\n\n$/);
	});

	it('follows with --follow, a probe every few seconds, until interrupted', async () => {
		vi.useFakeTimers();
		const {shell, tty} = setup();

		const running = shell.execute('kubectl logs --follow deploy/robinj-be-website --tail=0');
		await vi.advanceTimersByTimeAsync(10_000);
		shell.interrupt();
		await running;
		expect(tty.take()).toMatch(/^Found 2 pods, using pod\/\S+\n(10\.244\.0\.1 - - \[[^\]]+\] "GET \/ HTTP\/1\.1" 200 2330 "-" "kube-probe\/1\.37" "-"\n){2}\n$/);
		expect(shell.state.status).toBe(130);
	});
});

describe('kubectl top', () => {
	it('shows the node and the pods using resources', async () => {
		const {run} = setup();

		expect(await run('kubectl top nodes')).toBe('NAME         CPU(cores)   CPU(%)   MEMORY(bytes)   MEMORY(%)\nhomelab-01   183m         4%       3129Mi          19%');
		expect(await run('kubectl top pod')).toBe(`NAME                                 CPU(cores)   MEMORY(bytes)\n${POD}   21m          9Mi\n${OTHER_POD}   22m          10Mi`);
		expect(await run('kubectl top pods -A | tail -1')).toBe(`default     ${OTHER_POD}   22m          10Mi`);
		expect(await run('kubectl top pods --namespace=kube-system')).toBe('No resources found in kube-system namespace.');
	});

	it('shows its usage otherwise, failing for what it does not know', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl top')).toMatch(/^Display resource \(CPU\/memory\) usage\.\n/);
		expect(shell.state.status).toBe(0);
		expect(await run('kubectl top deploy')).toMatch(/^Display resource \(CPU\/memory\) usage\.\n/);
		expect(shell.state.status).toBe(1);
	});
});

describe('kubectl config', () => {
	it('shows the contexts, clusters and users there are', async () => {
		const {run} = setup();

		expect(await run('kubectl config get-contexts')).toBe('CURRENT   NAME               CLUSTER            AUTHINFO   NAMESPACE\n*         robins-apartment   robins-apartment   robin');
		expect(await run('kubectl config get-clusters')).toBe('NAME\nrobins-apartment');
		expect(await run('kubectl config get-users')).toBe('NAME\nrobin');
	});

	it('views the configuration without its secrets', async () => {
		const {run} = setup();

		expect(await run('kubectl config view')).toBe([
			'apiVersion: v1', 'clusters:', '- cluster:', '    certificate-authority-data: DATA+OMITTED', '    server: "https://192.168.1.42:6443"',
			'  name: robins-apartment', 'contexts:', '- context:', '    cluster: robins-apartment', '    user: robin', '  name: robins-apartment',
			'current-context: robins-apartment', 'kind: Config', 'preferences: {}', 'users:', '- name: robin', '  user:',
			'    client-certificate-data: DATA+OMITTED', '    client-key-data: DATA+OMITTED',
		].join('\n'));
	});

	it('cannot change anything', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl config use-context other')).toBe('error: no context exists with the name: "other"');
		expect(await run('kubectl config set-context x')).toBe('error: open /home/robin/.kube/config.lock: read-only file system');
		expect(await run('kubectl config unset users')).toBe('error: open /home/robin/.kube/config.lock: read-only file system');
		expect(shell.state.status).toBe(1);
	});

	it('lists its subcommands otherwise', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl config 2>&1 | head -1')).toBe('Modify kubeconfig files using subcommands like "kubectl config set current-context my-context".');
		expect(await run('kubectl config bogus 2>&1 | grep -c "^  "')).toBe('14');
		expect(await run('kubectl config bogus 2> /dev/null')).toBe('');
		expect(shell.state.status).toBe(1);
	});
});

describe('kubectl auth', () => {
	it('can look, and nothing more', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl auth can-i list deployments')).toBe('yes');
		expect(shell.state.status).toBe(0);
		expect(await run('kubectl auth can-i create pods')).toBe('no');
		expect(shell.state.status).toBe(1);
		expect(await run('kubectl auth can-i get')).toBe('error: you must specify two arguments: verb resource or verb resource/resourceName.');
		expect(await run('kubectl auth can-i --list | head -2')).toBe('Resources                                       Non-Resource URLs   Resource Names   Verbs\n*.*                                             []                  []               [get list watch]');
	});

	it('says who robin is', async () => {
		const {run} = setup();

		expect(await run('kubectl auth whoami')).toBe('ATTRIBUTE   VALUE\nUsername    robin\nGroups      [system:authenticated]');
	});

	it('lists its subcommands otherwise', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl auth')).toMatch(/^Inspect authorization\n\nAvailable Commands:\n {2}can-i /);
		expect(shell.state.status).toBe(0);
		expect(await run('kubectl auth reconcile 2> /dev/null')).toBe('');
		expect(shell.state.status).toBe(1);
	});
});

describe('kubectl rollout', () => {
	it('shows the status and history of the deployment', async () => {
		const {run} = setup();

		expect(await run('kubectl rollout status deploy/robinj-be-website')).toBe('deployment "robinj-be-website" successfully rolled out');
		expect(await run('kubectl rollout history deployment robinj-be-website')).toBe('deployment.apps/robinj-be-website \nREVISION   CHANGE-CAUSE\n13         <none>\n14         <none>\n');
	});

	it('may not restart or undo it', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl rollout restart deploy/robinj-be-website')).toBe('error: failed to patch: deployments.apps "robinj-be-website" is forbidden: User "robin" cannot patch resource "deployments" in API group "apps" in the namespace "default"');
		expect(shell.state.status).toBe(1);
	});

	it('only knows deployments, and needs one', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl rollout')).toMatch(/^Manage the rollout of one or many resources\.\n/);
		expect(shell.state.status).toBe(0);
		expect(await run('kubectl rollout status')).toBe('error: required resource not specified');
		expect(await run('kubectl rollout status svc/x')).toBe('error: no status viewer has been implemented for "Service"');
		expect(await run('kubectl rollout undo svc/x')).toBe('error: no history viewer has been implemented for "Service"');
		expect(await run('kubectl rollout status deploy/nope')).toBe('Error from server (NotFound): deployments.apps "nope" not found');
		expect(await run('kubectl rollout status bogus/x')).toBe('error: the server doesn\'t have a resource type "bogus"');
		expect(shell.state.status).toBe(1);
	});
});

describe('kubectl, changing things', () => {
	it('is forbidden from deleting, editing or patching what exists', async () => {
		const {shell, run} = setup();
		const denied = (verb, what, resource, group) => `${FORBIDDEN} ${what} is forbidden: User "robin" cannot ${verb} resource "${resource}" in API group "${group}" in the namespace "default"`;

		expect(await run('kubectl delete pods --all')).toBe([denied('delete', `pods "${POD}"`, 'pods', ''), denied('delete', `pods "${OTHER_POD}"`, 'pods', '')].join('\n'));
		expect(await run('kubectl replace deploy robinj-be-website')).toBe(denied('update', 'deployments.apps "robinj-be-website"', 'deployments', 'apps'));
		expect(await run('kubectl annotate hpa robinj-be-website')).toBe(denied('patch', 'horizontalpodautoscalers.autoscaling "robinj-be-website"', 'horizontalpodautoscalers', 'autoscaling'));
		expect(await run('kubectl edit svc/robinj-be-website -n kube-system')).toBe('Error from server (NotFound): services "robinj-be-website" not found');
		expect(shell.state.status).toBe(1);
	});

	it('needs to know what to change', async () => {
		const {run} = setup();

		expect(await run('kubectl delete')).toBe('error: You must provide one or more resources by argument or filename.');
		expect(await run('kubectl patch bogus x')).toBe('error: the server doesn\'t have a resource type "bogus"');
		expect(await run('kubectl delete pods')).toBe('error: resource(s) were provided, but no name was specified');
	});

	it('takes label and annotate changes for what they are, not for names', async () => {
		const {shell, run} = setup();

		expect(await run('kubectl label pod nope app=x old-')).toBe('Error from server (NotFound): pods "nope" not found');
		expect(await run(`kubectl annotate pod ${POD} note=hi`)).toBe(`${FORBIDDEN} pods "${POD}" is forbidden: User "robin" cannot patch resource "pods" in API group "" in the namespace "default"`);
		expect(await run('kubectl label pods app=x')).toBe('error: resource(s) were provided, but no name was specified');
		expect(await run('kubectl label app=x')).toBe('error: You must provide one or more resources by argument or filename.');
		expect(shell.state.status).toBe(1);
	});

	it('is forbidden from scaling', async () => {
		const {run} = setup();

		expect(await run('kubectl scale deploy x')).toBe('error: required flag(s) "replicas" not set');
		expect(await run('kubectl scale --replicas=3')).toBe('error: resource(s) were provided, but no name was specified');
		expect(await run('kubectl scale --replicas 3 statefulset/web')).toBe(`${FORBIDDEN} statefulsets.apps "web" is forbidden: User "robin" cannot patch resource "statefulsets/scale" in API group "apps" in the namespace "default"`);
	});

	it('is forbidden from getting into pods', async () => {
		const {run} = setup();
		const denied = subresource => `${FORBIDDEN} pods "${POD}" is forbidden: User "robin" cannot create resource "pods/${subresource}" in API group "" in the namespace "default"`;

		expect(await run('kubectl exec')).toBe("error: expected 'exec POD' : POD is a required argument for the exec command");
		expect(await run(`kubectl exec -it ${POD} -- sh`)).toBe(denied('exec'));
		expect(await run('kubectl exec pod/nope')).toBe('Error from server (NotFound): pods "nope" not found');
		expect(await run(`kubectl cp ${POD}:/etc/passwd .`)).toBe(denied('exec'));
		expect(await run(`kubectl port-forward po/${POD} 8080:80`)).toBe(denied('portforward'));
		expect(await run(`kubectl attach pods/${POD}`)).toBe(denied('attach'));
	});

	it('is forbidden from creating anything, and validates files first', async () => {
		const {run} = setup();
		const denied = (what, resource, group) => `${FORBIDDEN} ${what} is forbidden: User "robin" cannot create resource "${resource}" in API group "${group}" in the namespace "default"`;

		expect(await run('kubectl apply')).toBe('error: must specify one of -f and -k');
		expect(await run('kubectl apply -f nope.yaml')).toBe('error: the path "nope.yaml" does not exist');
		expect(await run('kubectl create --filename=cv.md')).toBe('error: error validating "cv.md": error validating data: [apiVersion not set, kind not set]; if you choose to ignore these errors, turn validation off with --validate=false');
		expect(await run('kubectl create')).toBe('error: must specify one of -f and -k');
		expect(await run('kubectl create deployment x --image=y')).toBe('error: failed to create deployment: deployments.apps is forbidden: User "robin" cannot create resource "deployments" in API group "apps" in the namespace "default"');
		expect(await run('kubectl run x --image=nginx')).toBe(denied('pods', 'pods', ''));
		expect(await run('kubectl expose deploy x')).toBe(denied('services', 'services', ''));
		expect(await run('kubectl autoscale deploy x')).toBe(denied('horizontalpodautoscalers.autoscaling', 'horizontalpodautoscalers', 'autoscaling'));
		expect(await run('kubectl set image deploy/robinj-be-website website=nginx')).toBe(`${FORBIDDEN} deployments.apps "robinj-be-website" is forbidden: User "robin" cannot patch resource "deployments" in API group "apps" in the namespace "default"`);
	});

	it('is forbidden from touching the node', async () => {
		const {run} = setup();
		const denied = `${FORBIDDEN} nodes "homelab-01" is forbidden: User "robin" cannot patch resource "nodes" in API group "" at the cluster scope`;

		expect(await run('kubectl cordon homelab-01')).toBe(denied);
		expect(await run('kubectl taint nodes homelab-01 a=b:NoSchedule')).toBe(denied);
		expect(await run('kubectl drain nope')).toBe('Error from server (NotFound): nodes "nope" not found');
		expect(await run('kubectl uncordon')).toBe('Error from server (NotFound): nodes "" not found');
	});
});
