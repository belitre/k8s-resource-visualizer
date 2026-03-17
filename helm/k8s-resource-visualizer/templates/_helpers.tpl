{{- define "k8s-resource-visualizer.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "k8s-resource-visualizer.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "k8s-resource-visualizer.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "k8s-resource-visualizer.labels" -}}
helm.sh/chart: {{ include "k8s-resource-visualizer.chart" . }}
{{ include "k8s-resource-visualizer.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "k8s-resource-visualizer.selectorLabels" -}}
app.kubernetes.io/name: {{ include "k8s-resource-visualizer.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "k8s-resource-visualizer.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "k8s-resource-visualizer.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Builds the frontend config.json content.
The local backend is always first. Each entry uses the object form
{url, color} when a color is provided, or just {url} when not.
*/}}
{{/*
Generates ClusterRole rules from backendConfig.resources.include when set,
grouping entries by apiGroup. Falls back to ["*"] when no include list is
provided (exclude-only or no filter), since RBAC cannot express exclusions.
Namespace filtering is enforced by the application, not RBAC.
*/}}
{{- define "k8s-resource-visualizer.clusterRoleRules" -}}
{{- if and .Values.backendConfig .Values.backendConfig.resources .Values.backendConfig.resources.include }}
{{- range .Values.backendConfig.resources.include }}
- apiGroups: [{{ .group | default "" | quote }}]
  resources: [{{ .resource | quote }}]
  verbs: ["get", "list", "watch"]
{{- end }}
{{- else }}
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
{{- end }}
{{- end }}

{{- define "k8s-resource-visualizer.frontendConfig" -}}
{{- $cfg := dict -}}
{{- if .Values.frontend.selfColor -}}
{{- $_ := set $cfg "selfColor" .Values.frontend.selfColor -}}
{{- end -}}
{{- $backends := list -}}
{{- range .Values.frontend.backends -}}
{{- $b := dict "url" .url -}}
{{- if .color -}}
{{- $_ := set $b "color" .color -}}
{{- end -}}
{{- $backends = append $backends $b -}}
{{- end -}}
{{- if $backends -}}
{{- $_ := set $cfg "backends" $backends -}}
{{- end -}}
{{- if .Values.frontend.defaultResources -}}
{{- $_ := set $cfg "defaultResources" .Values.frontend.defaultResources -}}
{{- end -}}
{{- $cfg | toJson -}}
{{- end }}
