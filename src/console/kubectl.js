import {OS_RELEASE, KUBE} from './fs';
import {ansi} from './util';

// kubectl, against the cluster at home: the website and its autoscaler. Robin's
// credentials can look at everything and change nothing.

const {cluster: CLUSTER, user: USER, server: SERVER} = KUBE;
const VERSION = 'v1.37.1';
const IMAGE = 'ghcr.io/robinj1995/robinj.be/website:20261027171221361edc';
const DIGEST = 'sha256:3f2a6c0ffee1337d15ea5ec0debadc0de8badf00dcafebabedeadbeef42a1b2';
const APP = 'robinj-be-website';
const HASH = '7c9d8f6b5d';
const OLD_HASH = '5f8b9c7d4f';
const NODE = 'homelab-01';
const NODE_IP = '192.168.1.42';

// Ages are relative to when the terminal first loaded this: the pods are from a
// rollout half an hour before.
const LOADED = Date.now();
const MINUTE = 60_000;
const DAY = 86_400_000;
const ago = ms => new Date(LOADED - ms);

const created = {
	cluster: ago(412 * DAY),
	deployment: ago(47 * DAY),
	oldReplicaSet: ago(9 * DAY),
	replicaSet: ago(37 * MINUTE),
	pods: ago(37 * MINUTE - 9000),
};

const PODS = [
	{name: `${APP}-${HASH}-q8zrm`, ip: '10.244.0.17', cpu: 21, memory: 9},
	{name: `${APP}-${HASH}-x2k4p`, ip: '10.244.0.18', cpu: 22, memory: 10},
];
const LABELS = {app: APP};
const REQUESTS = {cpu: '50m', memory: '32Mi'};
const HPA = {min: 1, max: 3, target: 70, current: 42};

// k8s.io/apimachinery's HumanDuration, as kubectl prints ages.
const age = since => {
	const seconds = Math.floor((Date.now() - since) / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const with2 = (a, unitA, b, unitB) => (b ? `${a}${unitA}${b}${unitB}` : `${a}${unitA}`);
	if (seconds < 120) {
		return `${seconds}s`;
	} else if (minutes < 10) {
		return with2(minutes, 'm', seconds % 60, 's');
	} else if (minutes < 180) {
		return `${minutes}m`;
	} else if (hours < 8) {
		return with2(hours, 'h', minutes % 60, 'm');
	} else if (hours < 48) {
		return `${hours}h`;
	} else if (hours < 192) {
		return with2(days, 'd', hours % 24, 'h');
	} else if (days < 730) {
		return `${days}d`;
	}

	return with2(Math.floor(days / 365), 'y', days % 365, 'd');
};

const rfc3339 = date => date.toISOString().replace(/\.\d+Z$/, 'Z');
const rfc1123 = date => date.toUTCString().replace('GMT', '+0000');

// Columns three spaces apart, as kubectl's tabwriter lays them out.
const table = rows => {
	const widths = rows[0].map((_, i) => Math.max(...rows.map(row => String(row[i]).length)));
	return rows.map(row => row.map((cell, i) => (i === row.length - 1 ? cell : String(cell).padEnd(widths[i]))).join('   ').trimEnd()).join('\n');
};

// kubectl's YAML: two-space indents, list items level with their key.
const yaml = (value, indent = '') => {
	const scalar = v => {
		if (v === null) {
			return 'null';
		} else if (typeof v === 'string' && (v === '' || /^[\d.-]+$|^(true|false|null|yes|no)$|[:#{}[\],&*?|<>=!%@`'"]|^\s|\s$/.test(v))) {
			return `"${v.replace(/"/g, '\\"')}"`;
		}
		return String(v);
	};
	const isEmpty = v => (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);

	if (Array.isArray(value)) {
		return value.map(item => {
			if (item && typeof item === 'object' && !isEmpty(item)) {
				const body = yaml(item, `${indent}  `);
				return `${indent}- ${body.slice(indent.length + 2)}`;
			}
			return `${indent}- ${item && typeof item === 'object' ? (Array.isArray(item) ? '[]' : '{}') : scalar(item)}`;
		}).join('\n');
	}

	return Object.entries(value).map(([key, v]) => {
		if (v && typeof v === 'object' && !isEmpty(v)) {
			return `${indent}${key}:\n${yaml(v, Array.isArray(v) ? indent : `${indent}  `)}`;
		}
		return `${indent}${key}: ${v && typeof v === 'object' ? (Array.isArray(v) ? '[]' : '{}') : scalar(v)}`;
	}).join('\n');
};

// --- The cluster's objects ---

const metadata = (name, when, {cluster, ...extra} = {}) => ({
	...extra,
	creationTimestamp: rfc3339(when),
	name,
	...(cluster ? {} : {namespace: 'default'}),
	resourceVersion: String(4200000 + name.length * 1337),
	uid: `c0ffee00-${name.length.toString(16).padStart(4, '0')}-4b1d-9e5a-badc0de13370`,
});

const probe = {failureThreshold: 3, httpGet: {path: '/', port: 80, scheme: 'HTTP'}, periodSeconds: 10, successThreshold: 1, timeoutSeconds: 1};
const container = {
	image: IMAGE,
	imagePullPolicy: 'IfNotPresent',
	livenessProbe: probe,
	name: 'website',
	ports: [{containerPort: 80, name: 'http', protocol: 'TCP'}],
	readinessProbe: probe,
	resources: {requests: REQUESTS},
};

const objects = {
	pods: () => PODS.map(pod => ({
		apiVersion: 'v1',
		kind: 'Pod',
		metadata: metadata(pod.name, created.pods, {
			generateName: `${APP}-${HASH}-`,
			labels: {...LABELS, 'pod-template-hash': HASH},
			ownerReferences: [{apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind: 'ReplicaSet', name: `${APP}-${HASH}`}],
		}),
		spec: {containers: [container], nodeName: NODE, nodeSelector: {'kubernetes.io/arch': 'riscv64'}, restartPolicy: 'Always', serviceAccountName: 'default'},
		status: {
			containerStatuses: [{
				containerID: `containerd://${pod.ip.split('.').pop()}f2a6c0ffee1337d15ea5e`,
				image: IMAGE, imageID: `ghcr.io/robinj1995/robinj.be/website@${DIGEST}`, name: 'website',
				ready: true, restartCount: 0, started: true, state: {running: {startedAt: rfc3339(created.pods)}},
			}],
			hostIP: NODE_IP,
			phase: 'Running',
			podIP: pod.ip,
			qosClass: 'Burstable',
			startTime: rfc3339(created.pods),
		},
	})),
	deployments: () => [{
		apiVersion: 'apps/v1',
		kind: 'Deployment',
		metadata: metadata(APP, created.deployment, {annotations: {'deployment.kubernetes.io/revision': '14'}, generation: 14, labels: LABELS}),
		spec: {
			progressDeadlineSeconds: 600, replicas: 2, revisionHistoryLimit: 10, selector: {matchLabels: LABELS},
			strategy: {rollingUpdate: {maxSurge: '25%', maxUnavailable: '25%'}, type: 'RollingUpdate'},
			template: {metadata: {labels: LABELS}, spec: {containers: [container], nodeSelector: {'kubernetes.io/arch': 'riscv64'}}},
		},
		status: {availableReplicas: 2, observedGeneration: 14, readyReplicas: 2, replicas: 2, updatedReplicas: 2},
	}],
	replicasets: () => [[HASH, created.replicaSet, 2, '14'], [OLD_HASH, created.oldReplicaSet, 0, '13']].map(([hash, when, replicas, revision]) => ({
		apiVersion: 'apps/v1',
		kind: 'ReplicaSet',
		metadata: metadata(`${APP}-${hash}`, when, {
			annotations: {'deployment.kubernetes.io/desired-replicas': '2', 'deployment.kubernetes.io/max-replicas': '3', 'deployment.kubernetes.io/revision': revision},
			labels: {...LABELS, 'pod-template-hash': hash},
			ownerReferences: [{apiVersion: 'apps/v1', blockOwnerDeletion: true, controller: true, kind: 'Deployment', name: APP}],
		}),
		spec: {replicas, selector: {matchLabels: {...LABELS, 'pod-template-hash': hash}}},
		status: {availableReplicas: replicas, readyReplicas: replicas, replicas},
	})),
	services: () => [
		['kubernetes', created.cluster, '10.96.0.1', {component: 'apiserver', provider: 'kubernetes'}, [{name: 'https', port: 443, protocol: 'TCP', targetPort: 6443}], null],
		[APP, created.deployment, '10.96.142.37', LABELS, [{name: 'http', port: 80, protocol: 'TCP', targetPort: 'http'}], LABELS],
	].map(([name, when, ip, labels, ports, selector]) => ({
		apiVersion: 'v1',
		kind: 'Service',
		metadata: metadata(name, when, {labels}),
		spec: {clusterIP: ip, clusterIPs: [ip], ports, ...(selector ? {selector} : {}), type: 'ClusterIP'},
		status: {loadBalancer: {}},
	})),
	horizontalpodautoscalers: () => [{
		apiVersion: 'autoscaling/v2',
		kind: 'HorizontalPodAutoscaler',
		metadata: metadata(APP, created.deployment),
		spec: {
			maxReplicas: HPA.max,
			metrics: [{resource: {name: 'cpu', target: {averageUtilization: HPA.target, type: 'Utilization'}}, type: 'Resource'}],
			minReplicas: HPA.min,
			scaleTargetRef: {apiVersion: 'apps/v1', kind: 'Deployment', name: APP},
		},
		status: {
			currentMetrics: [{resource: {current: {averageUtilization: HPA.current, averageValue: '21m'}, name: 'cpu'}, type: 'Resource'}],
			currentReplicas: 2,
			desiredReplicas: 2,
		},
	}],
	nodes: () => [{
		apiVersion: 'v1',
		kind: 'Node',
		metadata: metadata(NODE, created.cluster, {
			cluster: true,
			labels: {'kubernetes.io/arch': 'riscv64', 'kubernetes.io/hostname': NODE, 'kubernetes.io/os': 'linux', 'node-role.kubernetes.io/control-plane': ''},
		}),
		spec: {podCIDR: '10.244.0.0/24'},
		status: {
			addresses: [{address: NODE_IP, type: 'InternalIP'}, {address: NODE, type: 'Hostname'}],
			capacity: {cpu: '4', memory: '16109056Ki', pods: '110'},
			nodeInfo: {
				architecture: 'riscv64', containerRuntimeVersion: 'containerd://2.1.4', kernelVersion: OS_RELEASE.kernel,
				kubeProxyVersion: VERSION, kubeletVersion: VERSION, operatingSystem: 'linux', osImage: `${OS_RELEASE.name} ${OS_RELEASE.version} (Server Edition)`,
			},
		},
	}],
	namespaces: () => ['default', 'kube-node-lease', 'kube-public', 'kube-system'].map(name => ({
		apiVersion: 'v1',
		kind: 'Namespace',
		metadata: metadata(name, created.cluster, {cluster: true, labels: {'kubernetes.io/metadata.name': name}}),
		spec: {finalizers: ['kubernetes']},
		status: {phase: 'Active'},
	})),
};

// Resource names, short names and kinds -> {resource, group, kind, cluster-scoped}.
const TYPES = {
	pods: {aliases: ['po', 'pod'], group: '', kind: 'Pod'},
	deployments: {aliases: ['deploy', 'deployment'], group: 'apps', kind: 'Deployment'},
	replicasets: {aliases: ['rs', 'replicaset'], group: 'apps', kind: 'ReplicaSet'},
	services: {aliases: ['svc', 'service'], group: '', kind: 'Service'},
	horizontalpodautoscalers: {aliases: ['hpa', 'horizontalpodautoscaler'], group: 'autoscaling', kind: 'HorizontalPodAutoscaler'},
	nodes: {aliases: ['no', 'node'], group: '', kind: 'Node', cluster: true},
	namespaces: {aliases: ['ns', 'namespace'], group: '', kind: 'Namespace', cluster: true},
	events: {aliases: ['ev', 'event'], group: '', kind: 'Event'},
	configmaps: {aliases: ['cm', 'configmap'], group: '', kind: 'ConfigMap'},
	secrets: {aliases: ['secret'], group: '', kind: 'Secret'},
	ingresses: {aliases: ['ing', 'ingress'], group: 'networking.k8s.io', kind: 'Ingress'},
	statefulsets: {aliases: ['sts', 'statefulset'], group: 'apps', kind: 'StatefulSet'},
	daemonsets: {aliases: ['ds', 'daemonset'], group: 'apps', kind: 'DaemonSet'},
	jobs: {aliases: ['job'], group: 'batch', kind: 'Job'},
	cronjobs: {aliases: ['cj', 'cronjob'], group: 'batch', kind: 'CronJob'},
	persistentvolumeclaims: {aliases: ['pvc', 'persistentvolumeclaim'], group: '', kind: 'PersistentVolumeClaim'},
	serviceaccounts: {aliases: ['sa', 'serviceaccount'], group: '', kind: 'ServiceAccount'},
};

const resolveType = name => {
	const lower = name.toLowerCase().split('.')[0];
	const entry = Object.entries(TYPES).find(([resource, type]) => resource === lower || type.aliases.includes(lower) || type.kind.toLowerCase() === lower);
	return entry ? {resource: entry[0], ...entry[1]} : null;
};

const qualified = type => (type.group ? `${type.resource}.${type.group}` : type.resource);
const kindPrefix = type => (type.group ? `${type.kind.toLowerCase()}.${type.group}` : type.kind.toLowerCase());

const list = (type, namespace) => {
	if (!objects[type.resource]) {
		return [];
	}
	return objects[type.resource]().filter(item => type.cluster || namespace === null || item.metadata.namespace === namespace);
};

// --- Errors, all of them read-only ---

const scope = (type, namespace) => (type.cluster ? 'at the cluster scope' : `in the namespace "${namespace}"`);

const forbidden = (verb, type, name, namespace, subresource = '') => {
	const what = name ? `${qualified(type)} "${name}"` : qualified(type);
	return `Error from server (Forbidden): ${what} is forbidden: User "${USER}" cannot ${verb} resource "${type.resource}${subresource}" in API group "${type.group}" ${scope(type, namespace)}`;
};

const notFound = (type, name) => `Error from server (NotFound): ${qualified(type)} "${name}" not found`;

// --- Printing ---

const podRow = pod => [pod.metadata.name, '1/1', 'Running', '0', age(created.pods)];

const COLUMNS = {
	pods: {
		head: ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'],
		row: podRow,
		wide: ['IP', 'NODE', 'NOMINATED NODE', 'READINESS GATES'],
		wideRow: pod => [pod.status.podIP, NODE, '<none>', '<none>'],
	},
	deployments: {
		head: ['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'],
		row: d => [d.metadata.name, '2/2', '2', '2', age(created.deployment)],
		wide: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
		wideRow: () => ['website', IMAGE, `app=${APP}`],
	},
	replicasets: {
		head: ['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'],
		row: rs => [rs.metadata.name, rs.spec.replicas, rs.spec.replicas, rs.spec.replicas, age(new Date(rs.metadata.creationTimestamp))],
		wide: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
		wideRow: rs => ['website', IMAGE, `app=${APP},pod-template-hash=${rs.metadata.labels['pod-template-hash']}`],
	},
	services: {
		head: ['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'],
		row: s => [s.metadata.name, 'ClusterIP', s.spec.clusterIP, '<none>', s.spec.ports.map(p => `${p.port}/${p.protocol}`).join(','), age(new Date(s.metadata.creationTimestamp))],
		wide: ['SELECTOR'],
		wideRow: s => [s.spec.selector ? `app=${APP}` : '<none>'],
	},
	horizontalpodautoscalers: {
		head: ['NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS', 'AGE'],
		row: h => [h.metadata.name, `Deployment/${APP}`, `cpu: ${HPA.current}%/${HPA.target}%`, HPA.min, HPA.max, 2, age(created.deployment)],
	},
	nodes: {
		head: ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'],
		row: n => [n.metadata.name, 'Ready', 'control-plane', age(created.cluster), VERSION],
		wide: ['INTERNAL-IP', 'EXTERNAL-IP', 'OS-IMAGE', 'KERNEL-VERSION', 'CONTAINER-RUNTIME'],
		wideRow: n => [NODE_IP, '<none>', n.status.nodeInfo.osImage, OS_RELEASE.kernel, 'containerd://2.1.4'],
	},
	namespaces: {
		head: ['NAME', 'STATUS', 'AGE'],
		row: n => [n.metadata.name, 'Active', age(created.cluster)],
	},
};

const printTable = (type, items, {wide, allNamespaces, kindNames, headers = true}) => {
	const columns = COLUMNS[type.resource];
	const withNamespace = allNamespaces && !type.cluster;
	const head = [...(withNamespace ? ['NAMESPACE'] : []), ...columns.head, ...(wide && columns.wide ? columns.wide : [])];
	const rows = items.map(item => {
		const row = columns.row(item);
		if (kindNames) {
			row[0] = `${kindPrefix(type)}/${row[0]}`;
		}
		return [...(withNamespace ? [item.metadata.namespace] : []), ...row, ...(wide && columns.wideRow ? columns.wideRow(item) : [])];
	});

	return table(headers ? [head, ...rows] : rows);
};

// --- describe ---

const field = (label, value, width = 18) => `${`${label}:`.padEnd(width)}${value}`;
const labelLines = (labels, width) => {
	const entries = Object.entries(labels ?? {});
	if (entries.length === 0) {
		return [field('Labels', '<none>', width)];
	}
	return entries.map(([key, value], i) => (i ? `${''.padEnd(width)}${key}=${value}` : field('Labels', `${key}=${value}`, width)));
};

const DESCRIBE = {
	pods: pod => [
		field('Name', pod.metadata.name),
		field('Namespace', 'default'),
		field('Priority', '0'),
		field('Service Account', 'default'),
		field('Node', `${NODE}/${NODE_IP}`),
		field('Start Time', rfc1123(created.pods)),
		...labelLines(pod.metadata.labels, 18),
		field('Annotations', '<none>'),
		field('Status', 'Running'),
		field('IP', pod.status.podIP),
		'IPs:',
		`  IP:           ${pod.status.podIP}`,
		`Controlled By:  ReplicaSet/${APP}-${HASH}`,
		'Containers:',
		'  website:',
		`    Container ID:   ${pod.status.containerStatuses[0].containerID}`,
		`    Image:          ${IMAGE}`,
		`    Image ID:       ghcr.io/robinj1995/robinj.be/website@${DIGEST}`,
		'    Port:           80/TCP (http)',
		'    Host Port:      0/TCP (http)',
		'    State:          Running',
		`      Started:      ${rfc1123(created.pods)}`,
		'    Ready:          True',
		'    Restart Count:  0',
		'    Requests:',
		`      cpu:        ${REQUESTS.cpu}`,
		`      memory:     ${REQUESTS.memory}`,
		'    Liveness:     http-get http://:80/ delay=0s timeout=1s period=10s #success=1 #failure=3',
		'    Readiness:    http-get http://:80/ delay=0s timeout=1s period=10s #success=1 #failure=3',
		'    Environment:  <none>',
		'    Mounts:',
		'      /var/run/secrets/kubernetes.io/serviceaccount from kube-api-access-x7k2p (ro)',
		'Conditions:',
		'  Type                        Status',
		'  PodReadyToStartContainers   True ',
		'  Initialized                 True ',
		'  Ready                       True ',
		'  ContainersReady             True ',
		'  PodScheduled                True ',
		'QoS Class:                   Burstable',
		'Node-Selectors:              kubernetes.io/arch=riscv64',
		'Tolerations:                 node.kubernetes.io/not-ready:NoExecute op=Exists for 300s',
		'                             node.kubernetes.io/unreachable:NoExecute op=Exists for 300s',
		'Events:                      <none>',
	],
	deployments: d => [
		field('Name', d.metadata.name, 24),
		field('Namespace', 'default', 24),
		field('CreationTimestamp', rfc1123(created.deployment), 24),
		...labelLines(d.metadata.labels, 24),
		field('Annotations', 'deployment.kubernetes.io/revision: 14', 24),
		field('Selector', `app=${APP}`, 24),
		field('Replicas', '2 desired | 2 updated | 2 total | 2 available | 0 unavailable', 24),
		field('StrategyType', 'RollingUpdate', 24),
		field('MinReadySeconds', '0', 24),
		field('RollingUpdateStrategy', '25% max unavailable, 25% max surge', 24),
		'Pod Template:',
		`  Labels:  app=${APP}`,
		'  Containers:',
		'   website:',
		`    Image:      ${IMAGE}`,
		'    Port:       80/TCP (http)',
		'    Host Port:  0/TCP (http)',
		'    Requests:',
		`      cpu:        ${REQUESTS.cpu}`,
		`      memory:     ${REQUESTS.memory}`,
		'    Liveness:     http-get http://:80/ delay=0s timeout=1s period=10s #success=1 #failure=3',
		'    Readiness:    http-get http://:80/ delay=0s timeout=1s period=10s #success=1 #failure=3',
		'    Environment:  <none>',
		'    Mounts:       <none>',
		'  Volumes:        <none>',
		'  Node-Selectors: kubernetes.io/arch=riscv64',
		'  Tolerations:    <none>',
		'Conditions:',
		'  Type           Status  Reason',
		'  ----           ------  ------',
		'  Available      True    MinimumReplicasAvailable',
		'  Progressing    True    NewReplicaSetAvailable',
		`OldReplicaSets:  ${APP}-${OLD_HASH} (0/0 replicas created)`,
		`NewReplicaSet:   ${APP}-${HASH} (2/2 replicas created)`,
		'Events:          <none>',
	],
	horizontalpodautoscalers: h => [
		field('Name', h.metadata.name, 55),
		field('Namespace', 'default', 55),
		field('Labels', '<none>', 55),
		field('Annotations', '<none>', 55),
		field('CreationTimestamp', rfc1123(created.deployment), 55),
		field('Reference', `Deployment/${APP}`, 55),
		field('Metrics', '( current / target )', 55),
		`  resource cpu on pods  (as a percentage of request):  ${HPA.current}% (21m) / ${HPA.target}%`,
		field('Min replicas', HPA.min, 55),
		field('Max replicas', HPA.max, 55),
		field('Deployment pods', '2 current / 2 desired', 55),
		'Conditions:',
		'  Type            Status  Reason              Message',
		'  ----            ------  ------              -------',
		'  AbleToScale     True    ReadyForNewScale    recommended size matches current size',
		'  ScalingActive   True    ValidMetricFound    the HPA was able to successfully calculate a replica count from cpu resource utilization (percentage of request)',
		'  ScalingLimited  False   DesiredWithinRange  the desired count is within the acceptable range',
		'Events:           <none>',
	],
	services: s => [
		field('Name', s.metadata.name, 26),
		field('Namespace', 'default', 26),
		...labelLines(s.metadata.labels, 26),
		field('Annotations', '<none>', 26),
		field('Selector', s.spec.selector ? `app=${APP}` : '<none>', 26),
		field('Type', 'ClusterIP', 26),
		field('IP Family Policy', 'SingleStack', 26),
		field('IP Families', 'IPv4', 26),
		field('IP', s.spec.clusterIP, 26),
		field('IPs', s.spec.clusterIP, 26),
		...s.spec.ports.flatMap(p => [
			field('Port', `${p.name}  ${p.port}/${p.protocol}`, 26),
			field('TargetPort', `${p.targetPort}/${p.protocol}`, 26),
			field('Endpoints', s.spec.selector ? PODS.map(pod => `${pod.ip}:80`).join(',') : `${NODE_IP}:6443`, 26),
		]),
		field('Session Affinity', 'None', 26),
		field('Internal Traffic Policy', 'Cluster', 26),
		field('Events', '<none>', 26),
	],
	nodes: n => [
		field('Name', n.metadata.name, 19),
		field('Roles', 'control-plane', 19),
		...labelLines(n.metadata.labels, 19),
		field('CreationTimestamp', rfc1123(created.cluster), 19),
		field('Taints', '<none>', 19),
		field('Unschedulable', 'false', 19),
		'Addresses:',
		`  InternalIP:  ${NODE_IP}`,
		`  Hostname:    ${NODE}`,
		'Capacity:',
		'  cpu:                4',
		'  memory:             16109056Ki',
		'  pods:               110',
		'System Info:',
		`  Kernel Version:             ${OS_RELEASE.kernel}`,
		`  OS Image:                   ${n.status.nodeInfo.osImage}`,
		'  Operating System:           linux',
		'  Architecture:               riscv64',
		'  Container Runtime Version:  containerd://2.1.4',
		`  Kubelet Version:            ${VERSION}`,
		'PodCIDR:                      10.244.0.0/24',
		'Non-terminated Pods:          (2 in total)',
		'  Namespace                   Name                                  CPU Requests  CPU Limits  Memory Requests  Memory Limits  Age',
		'  ---------                   ----                                  ------------  ----------  ---------------  -------------  ---',
		...PODS.map(pod => `  default                     ${pod.name.padEnd(38)}50m (1%)      0 (0%)      32Mi (0%)        0 (0%)         ${age(created.pods)}`),
		'Events:                       <none>',
	],
	namespaces: n => [
		field('Name', n.metadata.name, 14),
		...labelLines(n.metadata.labels, 14),
		field('Annotations', '<none>', 14),
		field('Status', 'Active', 14),
		'',
		'No resource quota.',
		'',
		'No LimitRange resource.',
	],
	replicasets: rs => [
		field('Name', rs.metadata.name, 16),
		field('Namespace', 'default', 16),
		field('Selector', `app=${APP},pod-template-hash=${rs.metadata.labels['pod-template-hash']}`, 16),
		...labelLines(rs.metadata.labels, 16),
		field('Controlled By', `Deployment/${APP}`, 16),
		field('Replicas', `${rs.spec.replicas} current / ${rs.spec.replicas} desired`, 16),
		field('Pods Status', `${rs.spec.replicas} Running / 0 Waiting / 0 Succeeded / 0 Failed`, 16),
		field('Events', '<none>', 16),
	],
};

// --- Logs: nginx, as the pods have been running since the rollout ---

const nginxTime = date => {
	const pad = n => String(n).padStart(2, '0');
	const month = date.toUTCString().slice(8, 11);
	return `${pad(date.getUTCDate())}/${month}/${date.getUTCFullYear()}:${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
};

const VISITS = [
	['/', 2330, 'Mozilla/5.0 (X11; Linux riscv64; rv:144.0) Gecko/20100101 Firefox/144.0'],
	['/cv', 14211, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'],
	['/side-quests', 11806, 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
	['/cv/source', 13372, 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'],
	['/contact', 6143, 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'],
	['/wp-login.php', 153, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'],
	['/.env', 153, 'curl/8.12.1'],
];

const logLine = (when, path, status, bytes, agent) => `10.244.0.1 - - [${nginxTime(when)}] "GET ${path} HTTP/1.1" ${status} ${bytes} "-" "${agent}" "-"`;
const probeLine = when => logLine(when, '/', 200, 2330, 'kube-probe/1.37');

const podLog = (pod, index, until = new Date()) => {
	const start = created.pods;
	const stamp = date => date.toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '/');
	const lines = [
		{at: start, text: '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration'},
		{at: start, text: '/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/'},
		{at: start, text: '/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh'},
		{at: start, text: '10-listen-on-ipv6-by-default.sh: info: /etc/nginx/conf.d/default.conf differs from the packaged version'},
		{at: start, text: '/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh'},
		{at: start, text: '/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh'},
		{at: start, text: '/docker-entrypoint.sh: Configuration complete; ready for start up'},
		...['using the "epoll" event method', 'nginx/1.28.0', 'built by gcc 12.2.0 (Debian 12.2.0-14+deb12u1)', `OS: Linux ${OS_RELEASE.kernel}`,
			'getrlimit(RLIMIT_NOFILE): 1048576:1048576', 'start worker processes', 'start worker process 29', 'start worker process 30']
			.map(text => ({at: start, text: `${stamp(start)} [notice] 1#1: ${text}`})),
	];

	for (let t = start.getTime() + 10_000 + index * 4_000; t <= until.getTime(); t += 10_000) {
		lines.push({at: new Date(t), text: probeLine(new Date(t))});
	}
	VISITS.forEach(([path, bytes, agent], i) => {
		if (i % 2 === index) {
			const when = new Date(start.getTime() + (i + 1) * 4.1 * MINUTE);
			lines.push({at: when, text: logLine(when, path, path.startsWith('/.') || path.endsWith('.php') ? 404 : 200, bytes, agent)});
		}
	});
	// Whoever's looking at the site right now: hello.
	if (index === 0 && globalThis.location) {
		lines.push({at: new Date(LOADED), text: logLine(new Date(LOADED), globalThis.location.pathname, 200, 13372, globalThis.navigator?.userAgent ?? 'Mozilla/5.0')});
	}

	return lines.sort((a, b) => a.at - b.at);
};

// --- The command ---

const parse = args => {
	const flags = {};
	const positional = [];
	const takesValue = new Set(['n', 'namespace', 'o', 'output', 'l', 'selector', 'c', 'container', 'tail', 'context', 'replicas', 'image', 'f', 'filename', 'since', 'type', 'port', 'sort-by']);
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--') {
			positional.push(...args.slice(i + 1));
			break;
		}
		const long = arg.match(/^--([\w-]+)(?:=(.*))?$/);
		const short = arg.match(/^-([A-Za-z])(.*)$/);
		if (long) {
			flags[long[1]] = long[2] ?? (takesValue.has(long[1]) ? args[++i] : true);
		} else if (short && takesValue.has(short[1]) && !(short[1] === 'f' && ['logs', 'log'].includes(positional[0]))) {
			flags[short[1]] = short[2].replace(/^=/, '') || args[++i];
		} else if (short) {
			for (const c of arg.slice(1)) {
				flags[c] = true;
			}
		} else {
			positional.push(arg);
		}
	}

	return {flags, positional};
};

const HELP = `kubectl controls the Kubernetes cluster manager.

 Find more information at: https://kubernetes.io/docs/reference/kubectl/

Basic Commands (Beginner):
  create          Create a resource from a file or from stdin
  expose          Take a replication controller, service, deployment or pod and expose it as a new Kubernetes service
  run             Run a particular image on the cluster
  set             Set specific features on objects

Basic Commands (Intermediate):
  explain         Get documentation for a resource
  get             Display one or many resources
  edit            Edit a resource on the server
  delete          Delete resources by file names, stdin, resources and names, or by resources and label selector

Deploy Commands:
  rollout         Manage the rollout of a resource
  scale           Set a new size for a deployment, replica set, or replication controller
  autoscale       Auto-scale a deployment, replica set, stateful set, or replication controller

Cluster Management Commands:
  certificate     Modify certificate resources
  cluster-info    Display cluster information
  top             Display resource (CPU/memory) usage
  cordon          Mark node as unschedulable
  uncordon        Mark node as schedulable
  drain           Drain node in preparation for maintenance
  taint           Update the taints on one or more nodes

Troubleshooting and Debugging Commands:
  describe        Show details of a specific resource or group of resources
  logs            Print the logs for a container in a pod
  attach          Attach to a running container
  exec            Execute a command in a container
  port-forward    Forward one or more local ports to a pod
  proxy           Run a proxy to the Kubernetes API server
  cp              Copy files and directories to and from containers
  auth            Inspect authorization
  debug           Create debugging sessions for troubleshooting workloads and nodes
  events          List events

Advanced Commands:
  diff            Diff the live version against a would-be applied version
  apply           Apply a configuration to a resource by file name or stdin
  patch           Update fields of a resource
  replace         Replace a resource by file name or stdin
  kustomize       Build a kustomization target from a directory or URL

Settings Commands:
  label           Update the labels on a resource
  annotate        Update the annotations on a resource
  completion      Output shell completion code for the specified shell (bash, zsh, fish, or powershell)

Other Commands:
  api-resources   Print the supported API resources on the server
  api-versions    Print the supported API versions on the server, in the form of "group/version"
  config          Modify kubeconfig files
  plugin          Provides utilities for interacting with plugins
  version         Print the client and server version information

Usage:
  kubectl [flags] [options]

Use "kubectl <command> --help" for more information about a given command.
Use "kubectl options" for a list of global command-line options (applies to all commands).
`;

const KUBECONFIG_LOCK = 'error: open /home/robin/.kube/config.lock: read-only file system';

// `type name`, `type/name` or `type1,type2` -> [{type, names}].
const targets = positional => {
	if (positional.length === 0) {
		return {error: 'error: you must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.'};
	}

	const [first, ...rest] = positional;
	if (first.includes('/')) {
		const groups = [];
		for (const spec of positional) {
			const [typeName, name] = spec.split('/');
			const type = resolveType(typeName);
			if (!type) {
				return {error: `error: the server doesn't have a resource type "${typeName}"`};
			}
			groups.push({type, names: [name]});
		}
		return {groups};
	}

	const groups = [];
	for (const typeName of first.split(',')) {
		if (typeName === 'all') {
			for (const resource of ['pods', 'services', 'deployments', 'replicasets', 'horizontalpodautoscalers']) {
				groups.push({type: resolveType(resource), names: rest, all: true});
			}
			continue;
		}
		const type = resolveType(typeName);
		if (!type) {
			return {error: `error: the server doesn't have a resource type "${typeName}"`};
		}
		groups.push({type, names: rest});
	}

	return {groups};
};

const selects = (item, selector) => !selector || selector.split(',').every(term => {
	const [key, value] = term.split('=');
	return item.metadata.labels?.[key] === value;
});

const get = async (api, flags, positional) => {
	const parsed = targets(positional);
	if (parsed.error) {
		api.err(`${parsed.error}\n`);
		return 1;
	}

	const allNamespaces = flags.A || flags['all-namespaces'];
	const namespace = allNamespaces ? null : flags.n ?? flags.namespace ?? 'default';
	const output = flags.o ?? flags.output;
	const blocks = [];
	const found = [];
	let status = 0;

	for (const group of parsed.groups) {
		const items = list(group.type, namespace).filter(item => selects(item, flags.l ?? flags.selector));
		const named = group.names.length ? group.names.map(name => {
			const item = items.find(other => other.metadata.name === name);
			if (!item) {
				api.err(`${notFound(group.type, name)}\n`);
				status = 1;
			}
			return item;
		}).filter(Boolean) : items;

		if (named.length === 0 || !COLUMNS[group.type.resource]) {
			continue;
		}
		found.push(...named.map(item => ({type: group.type, item})));
		if (!output || output === 'wide') {
			blocks.push(printTable(group.type, named, {
				wide: output === 'wide', allNamespaces, kindNames: group.all || parsed.groups.length > 1, headers: !flags['no-headers'],
			}));
		}
	}

	if (found.length === 0 && status === 0) {
		api.err(namespace === null || parsed.groups.every(group => group.type.cluster) ? 'No resources found\n' : `No resources found in ${namespace} namespace.\n`);
		return 0;
	} else if (output === 'name') {
		api.out(found.map(({type, item}) => `${kindPrefix(type)}/${item.metadata.name}\n`).join(''));
	} else if (output === 'yaml' || output === 'json') {
		const single = found.length === 1 && parsed.groups.every(group => group.names.length);
		const value = single ? found[0].item : {apiVersion: 'v1', items: found.map(({item}) => item), kind: 'List', metadata: {resourceVersion: ''}};
		api.out(`${output === 'json' ? JSON.stringify(value, null, 4) : yaml(value)}\n`);
	} else if (output && output !== 'wide') {
		api.err(`error: unable to match a printer suitable for the output format "${output}", allowed formats are: custom-columns,custom-columns-file,go-template,go-template-file,json,jsonpath,jsonpath-as-json,jsonpath-file,name,template,templatefile,wide,yaml\n`);
		return 1;
	} else if (blocks.length) {
		api.out(`${blocks.join('\n\n')}\n`);
	}

	if (flags.w || flags.watch) {
		await api.abort.race(new Promise(() => {}));
	}
	return status;
};

const describe = (api, flags, positional) => {
	const parsed = targets(positional);
	if (parsed.error) {
		api.err(`${parsed.error.replace('to get', 'to describe')}\n`);
		return 1;
	}

	const namespace = flags.n ?? flags.namespace ?? 'default';
	const pages = [];
	let status = 0;
	for (const group of parsed.groups) {
		const items = list(group.type, namespace);
		const missing = group.names.filter(name => !items.some(item => item.metadata.name === name));
		for (const name of missing) {
			api.err(`${notFound(group.type, name)}\n`);
			status = 1;
		}
		const chosen = group.names.length ? items.filter(item => group.names.includes(item.metadata.name)) : items;
		if (DESCRIBE[group.type.resource]) {
			pages.push(...chosen.map(item => DESCRIBE[group.type.resource](item).join('\n')));
		}
	}

	if (pages.length) {
		api.out(`${pages.join('\n\n\n')}\n`);
	} else if (status === 0) {
		api.err(`No resources found in ${namespace} namespace.\n`);
	}
	return status;
};

const logs = async (api, flags, positional) => {
	const [target] = positional;
	if (!target && !flags.l) {
		api.err('error: expected \'logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER]\'.\nPOD or TYPE/NAME is a required argument for the logs command\nSee \'kubectl logs -h\' for help and examples\n');
		return 1;
	}

	let pods = PODS.map((pod, index) => ({pod, index}));
	if (flags.l) {
		pods = (flags.l === `app=${APP}`) ? pods : [];
		if (!pods.length) {
			api.err('No resources found in default namespace.\n');
			return 0;
		}
	} else if (target.includes('/')) {
		const [typeName, name] = target.split('/');
		const type = resolveType(typeName);
		if (!type || !['deployments', 'replicasets', 'pods'].includes(type.resource) || !list(type, 'default').some(item => item.metadata.name === name)) {
			api.err(`${type ? notFound(type, name) : `error: the server doesn't have a resource type "${typeName}"`}\n`);
			return 1;
		} else if (type.resource === 'pods') {
			pods = pods.filter(({pod}) => pod.name === name);
		} else {
			api.err(`Found 2 pods, using pod/${PODS[0].name}\n`);
			pods = pods.slice(0, 1);
		}
	} else {
		pods = pods.filter(({pod}) => pod.name === target);
		if (!pods.length) {
			api.err(`${notFound(resolveType('pods'), target)}\n`);
			return 1;
		}
	}

	if (flags.p || flags.previous) {
		api.err(`Error from server (BadRequest): previous terminated container "website" in pod "${pods[0].pod.name}" not found\n`);
		return 1;
	} else if ((flags.c ?? flags.container ?? 'website') !== 'website') {
		api.err(`error: container ${flags.c ?? flags.container} is not valid for pod ${pods[0].pod.name}\n`);
		return 1;
	}

	const prefix = pod => (flags.prefix || flags.l ? `[pod/${pod.name}/website] ` : '');
	const format = (pod, line) => `${prefix(pod)}${flags.timestamps ? `${line.at.toISOString().replace('Z', '000000Z')} ` : ''}${line.text}\n`;
	let lines = pods.flatMap(({pod, index}) => podLog(pod, index).map(line => ({pod, line}))).sort((a, b) => a.line.at - b.line.at);
	if (flags.tail !== undefined && Number(flags.tail) >= 0) {
		lines = lines.slice(Math.max(lines.length - Number(flags.tail), 0));
	}
	api.out(lines.map(({pod, line}) => format(pod, line)).join(''));

	if (flags.f || flags.follow) {
		for (let n = 0; ; n++) {
			await api.sleep(5000);
			const {pod} = pods[n % pods.length];
			api.out(format(pod, {at: new Date(), text: probeLine(new Date())}));
		}
	}
	return 0;
};

const top = (api, flags, positional) => {
	const kind = resolveType(positional[0] ?? '');
	if (kind?.resource === 'nodes') {
		api.out(`${table([['NAME', 'CPU(cores)', 'CPU(%)', 'MEMORY(bytes)', 'MEMORY(%)'], [NODE, '183m', '4%', '3129Mi', '19%']])}\n`);
	} else if (kind?.resource === 'pods') {
		const namespace = flags.A ? null : flags.n ?? flags.namespace ?? 'default';
		if (namespace !== null && namespace !== 'default') {
			api.err(`No resources found in ${namespace} namespace.\n`);
			return 0;
		}
		api.out(`${table([[...(flags.A ? ['NAMESPACE'] : []), 'NAME', 'CPU(cores)', 'MEMORY(bytes)'], ...PODS.map(pod => [...(flags.A ? ['default'] : []), pod.name, `${pod.cpu}m`, `${pod.memory}Mi`])])}\n`);
	} else {
		api.err('Display resource (CPU/memory) usage.\n\nAvailable Commands:\n  node          Display resource (CPU/memory) usage of nodes\n  pod           Display resource (CPU/memory) usage of pods\n\nUsage:\n  kubectl top [flags] [options]\n');
		return positional.length ? 1 : 0;
	}
	return 0;
};

const config = (api, flags, positional) => {
	const [sub, name] = positional;
	switch (sub) {
		case 'current-context':
			api.out(`${CLUSTER}\n`);
			return 0;
		case 'get-contexts':
			api.out(`${table([['CURRENT', 'NAME', 'CLUSTER', 'AUTHINFO', 'NAMESPACE'], ['*', CLUSTER, CLUSTER, USER, '']])}\n`);
			return 0;
		case 'get-clusters':
			api.out(`NAME\n${CLUSTER}\n`);
			return 0;
		case 'get-users':
			api.out(`NAME\n${USER}\n`);
			return 0;
		case 'view':
			api.out(`${yaml({
				apiVersion: 'v1',
				clusters: [{cluster: {'certificate-authority-data': 'DATA+OMITTED', server: SERVER}, name: CLUSTER}],
				contexts: [{context: {cluster: CLUSTER, user: USER}, name: CLUSTER}],
				'current-context': CLUSTER,
				kind: 'Config',
				preferences: {},
				users: [{name: USER, user: {'client-certificate-data': 'DATA+OMITTED', 'client-key-data': 'DATA+OMITTED'}}],
			})}\n`);
			return 0;
		case 'use-context':
		case 'set-context':
		case 'set-cluster':
		case 'set-credentials':
		case 'delete-context':
		case 'delete-cluster':
		case 'rename-context':
		case 'set':
		case 'unset':
			if (sub === 'use-context' && name && name !== CLUSTER) {
				api.err(`error: no context exists with the name: "${name}"\n`);
				return 1;
			}
			api.err(`${KUBECONFIG_LOCK}\n`);
			return 1;
		default:
			api.err('Modify kubeconfig files using subcommands like "kubectl config set current-context my-context".\n\nAvailable Commands:\n  current-context   Display the current-context\n  delete-cluster    Delete the specified cluster from the kubeconfig\n  delete-context    Delete the specified context from the kubeconfig\n  get-clusters      Display clusters defined in the kubeconfig\n  get-contexts      Describe one or many contexts\n  get-users         Display users defined in the kubeconfig\n  rename-context    Rename a context from the kubeconfig file\n  set               Set an individual value in a kubeconfig file\n  set-cluster       Set a cluster entry in kubeconfig\n  set-context       Set a context entry in kubeconfig\n  set-credentials   Set a user entry in kubeconfig\n  unset             Unset an individual value in a kubeconfig file\n  use-context       Set the current-context in a kubeconfig file\n  view              Display merged kubeconfig settings or a specified kubeconfig file\n');
			return sub ? 1 : 0;
	}
};

const auth = (api, flags, positional) => {
	const [sub, verb, resource] = positional;
	if (sub === 'whoami') {
		api.out(`ATTRIBUTE   VALUE\nUsername    ${USER}\nGroups      [system:authenticated]\n`);
		return 0;
	} else if (sub !== 'can-i') {
		api.err('Inspect authorization\n\nAvailable Commands:\n  can-i         Check whether an action is allowed\n  reconcile     Reconciles rules for RBAC role, role binding, cluster role, and cluster role binding objects\n  whoami        Experimental: Check self subject attributes\n');
		return sub ? 1 : 0;
	} else if (flags.list) {
		api.out(`${table([['Resources', 'Non-Resource URLs', 'Resource Names', 'Verbs'],
			['*.*', '[]', '[]', '[get list watch]'],
			['selfsubjectreviews.authentication.k8s.io', '[]', '[]', '[create]'],
			['selfsubjectaccessreviews.authorization.k8s.io', '[]', '[]', '[create]'],
			['', '[*]', '[]', '[get]']])}\n`);
		return 0;
	} else if (!verb || !resource) {
		api.err('error: you must specify two arguments: verb resource or verb resource/resourceName.\n');
		return 1;
	}

	const allowed = ['get', 'list', 'watch'].includes(verb);
	api.out(`${allowed ? 'yes' : 'no'}\n`);
	return allowed ? 0 : 1;
};

const rollout = (api, flags, positional) => {
	const [sub, ...rest] = positional;
	const parsed = rest.length ? targets(rest) : {error: 'error: required resource not specified'};
	if (!sub) {
		api.err('Manage the rollout of one or many resources.\n\nAvailable Commands:\n  history       View rollout history\n  pause         Mark the provided resource as paused\n  restart       Restart a resource\n  resume        Resume a paused resource\n  status        Show the status of the rollout\n  undo          Undo a previous rollout\n');
		return 0;
	} else if (parsed.error) {
		api.err(`${parsed.error}\n`);
		return 1;
	}

	const {type, names} = parsed.groups[0];
	const name = names[0];
	if (type.resource !== 'deployments') {
		api.err(`error: no ${sub === 'status' ? 'status viewer' : 'history viewer'} has been implemented for "${type.kind}"\n`);
		return 1;
	} else if (name !== APP) {
		api.err(`${notFound(type, name)}\n`);
		return 1;
	} else if (sub === 'status') {
		api.out(`deployment "${APP}" successfully rolled out\n`);
		return 0;
	} else if (sub === 'history') {
		api.out(`deployment.apps/${APP} \n${table([['REVISION', 'CHANGE-CAUSE'], ['13', '<none>'], ['14', '<none>']])}\n\n`);
		return 0;
	}

	api.err(`error: failed to patch: ${forbidden('patch', type, name, 'default').replace('Error from server (Forbidden): ', '')}\n`);
	return 1;
};

// Every way of changing something, and the permission it lacks.
const write = (api, command, flags, positional) => {
	const namespace = flags.n ?? flags.namespace ?? 'default';
	const named = (args = positional) => {
		const parsed = targets(args.length ? args : ['pods']);
		return parsed.error ? null : parsed.groups[0];
	};
	const fail = message => {
		api.err(`${message}\n`);
		return 1;
	};

	switch (command) {
		case 'delete':
		case 'label':
		case 'annotate':
		case 'edit':
		case 'patch':
		case 'replace': {
			const resources = ['label', 'annotate'].includes(command) ? positional.filter(arg => !/=|-$/.test(arg)) : positional;
			if (resources.length === 0) {
				return fail('error: You must provide one or more resources by argument or filename.');
			}
			const group = named(resources);
			if (!group) {
				return fail(targets(resources).error);
			}
			const items = list(group.type, namespace);
			const names = group.names.length ? group.names : flags.all ? items.map(item => item.metadata.name) : [];
			if (names.length === 0) {
				return fail('error: resource(s) were provided, but no name was specified');
			}
			const verb = command === 'delete' ? 'delete' : command === 'replace' ? 'update' : 'patch';
			for (const name of names) {
				api.err(`${items.some(item => item.metadata.name === name) ? forbidden(verb, group.type, name, namespace) : notFound(group.type, name)}\n`);
			}
			return 1;
		}
		case 'scale': {
			const group = named();
			if (!flags.replicas) {
				return fail('error: required flag(s) "replicas" not set');
			} else if (!group?.names.length) {
				return fail('error: resource(s) were provided, but no name was specified');
			}
			return fail(forbidden('patch', group.type, group.names[0], namespace, '/scale'));
		}
		case 'rollout':
			return rollout(api, flags, positional);
		case 'exec':
		case 'attach':
		case 'cp':
		case 'port-forward': {
			const pod = (positional[0] ?? '').replace(/^(pods?|po)\//, '');
			if (!pod) {
				return fail(`error: expected '${command} POD' : POD is a required argument for the ${command} command`);
			} else if (!PODS.some(other => other.name === pod.split(':')[0])) {
				return fail(notFound(resolveType('pods'), pod.split(':')[0]));
			}
			const subresource = {exec: '/exec', attach: '/attach', cp: '/exec', 'port-forward': '/portforward'}[command];
			return fail(forbidden('create', resolveType('pods'), pod.split(':')[0], namespace, subresource));
		}
		case 'apply':
		case 'create': {
			const file = flags.f ?? flags.filename;
			if (command === 'apply' && !file) {
				return fail('error: must specify one of -f and -k');
			} else if (file) {
				const result = api.fs.read(api.resolve(file));
				if (result.error) {
					return fail(`error: the path "${file}" does not exist`);
				}
				return fail(`error: error validating "${file}": error validating data: [apiVersion not set, kind not set]; if you choose to ignore these errors, turn validation off with --validate=false`);
			}
			const type = resolveType(positional[0] ?? '');
			if (!type) {
				return fail(`error: must specify one of -f and -k`);
			}
			return fail(`error: failed to create ${type.kind.toLowerCase()}: ${forbidden('create', type, null, namespace).replace('Error from server (Forbidden): ', '')}`);
		}
		case 'run':
			return fail(forbidden('create', resolveType('pods'), null, namespace));
		case 'expose':
			return fail(forbidden('create', resolveType('services'), null, namespace));
		case 'autoscale':
			return fail(forbidden('create', resolveType('hpa'), null, namespace));
		case 'set':
			return fail(forbidden('patch', resolveType('deployments'), APP, namespace));
		case 'cordon':
		case 'uncordon':
		case 'drain':
		case 'taint':
			if (positional[0] !== NODE && positional[1] !== NODE) {
				return fail(notFound(resolveType('nodes'), positional[0] ?? ''));
			}
			return fail(forbidden('patch', resolveType('nodes'), NODE, null));
		default:
			return fail(`error: unknown command "${command}" for "kubectl"`);
	}
};

export const kubectl = async api => {
	const {flags, positional} = parse(api.args);
	const [command, ...rest] = positional;
	const context = flags.context;
	if (context && context !== CLUSTER) {
		api.err(`error: context was not found for specified context: ${context}\n`);
		return 1;
	} else if (!command) {
		api.out(HELP);
		return 0;
	}

	switch (command) {
		case 'get':
			return get(api, flags, rest);
		case 'describe':
			return describe(api, flags, rest);
		case 'logs':
		case 'log':
			return logs(api, flags, rest);
		case 'top':
			return top(api, flags, rest);
		case 'config':
			return config(api, flags, rest);
		case 'auth':
			return auth(api, flags, rest);
		case 'version':
			api.out(flags.client
				? `Client Version: ${VERSION}\nKustomize Version: v5.7.1\n`
				: `Client Version: ${VERSION}\nKustomize Version: v5.7.1\nServer Version: ${VERSION}\n`);
			return 0;
		case 'cluster-info': {
			const painted = api.stdout.isTTY;
			api.out(`${painted ? ansi('0;32', 'Kubernetes control plane') : 'Kubernetes control plane'} is running at ${painted ? ansi('0;33', SERVER) : SERVER}\n\nTo further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.\n`);
			return 0;
		}
		case 'api-versions':
			api.out(['admissionregistration.k8s.io/v1', 'apps/v1', 'authentication.k8s.io/v1', 'authorization.k8s.io/v1', 'autoscaling/v1', 'autoscaling/v2', 'batch/v1', 'networking.k8s.io/v1', 'rbac.authorization.k8s.io/v1', 'v1'].map(v => `${v}\n`).join(''));
			return 0;
		case 'events':
			api.err('No events found in default namespace.\n');
			return 0;
		default:
			return write(api, command, flags, rest);
	}
};
