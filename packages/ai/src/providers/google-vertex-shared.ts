import { Effect } from "effect"
import type { ProviderPackage } from "../provider-package.js"
import { Auth, MissingCredentialError } from "../route/auth.js"
import type { CompactionOperations, Route } from "../route/client.js"
import { ProviderConfigurationError, ProviderID, type RequestOptions } from "../schema/index.js"

const id = ProviderID.make("google-vertex")

export type OAuthOptions =
  | { readonly accessToken?: string; readonly auth?: never }
  | { readonly accessToken?: never; readonly auth?: Auth.Definition }

export type ApiKeyOptions =
  | (OAuthOptions & { readonly apiKey?: never })
  | { readonly accessToken?: never; readonly apiKey?: string; readonly auth?: never }

export const project = (value?: string) =>
  value ??
  process.env.GOOGLE_VERTEX_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCP_PROJECT ??
  process.env.GCLOUD_PROJECT

export const location = (value: string | undefined) =>
  value ??
  process.env.GOOGLE_VERTEX_LOCATION ??
  process.env.GOOGLE_CLOUD_LOCATION ??
  process.env.VERTEX_LOCATION ??
  "global"

export const host = (location: string) => {
  if (location === "global") return "aiplatform.googleapis.com"
  // Jurisdictional multi-regions use Regional Endpoint Platform domains.
  if (location === "eu" || location === "us") return `aiplatform.${location}.rep.googleapis.com`
  return `${location}-aiplatform.googleapis.com`
}

export const requireProject = (value: string | undefined) => {
  if (value) return value
  throw new ProviderConfigurationError({
    provider: id,
    message: "Google Vertex requires a project when baseURL is not configured",
  })
}

export const apiKey = (input: ApiKeyOptions & { readonly project?: string; readonly location?: string }) => {
  if (input.apiKey !== undefined && (input.accessToken !== undefined || input.auth !== undefined))
    throw new ProviderConfigurationError({
      provider: id,
      message: "Google Vertex apiKey cannot be combined with accessToken or auth",
    })
  if (input.accessToken !== undefined || input.auth !== undefined) return undefined
  if (input.apiKey !== undefined) return input.apiKey
  // Same precedence as Google's Gen AI SDK: an explicit project or location selects Google credentials,
  // so an ambient API key cannot replace them.
  if (input.project !== undefined || input.location !== undefined) return undefined
  return process.env.GOOGLE_VERTEX_API_KEY
}

// Google's credential lookup contacts metadata and token hosts, so this local-only build has none.
const adc = () =>
  Auth.effect(Effect.fail(new MissingCredentialError("Google Application Default Credentials"))).bearer()

export const oauth = (input: OAuthOptions, _project?: string) => {
  if (input.accessToken !== undefined && input.auth !== undefined)
    throw new ProviderConfigurationError({
      provider: id,
      message: "Google Vertex accessToken cannot be combined with auth",
    })
  if (input.auth) return input.auth
  if (input.accessToken !== undefined) return Auth.bearer(input.accessToken)
  return adc()
}

export const oauthRoute = <Body, Prepared, Compact extends CompactionOperations | undefined>(
  route: Route<Body, Prepared, Compact>,
  label: string,
  input: RequestOptions &
    OAuthOptions & { readonly baseURL?: string; readonly location?: string; readonly project?: string },
  url: (project: string, location: string) => string,
) => {
  if ("apiKey" in input && input.apiKey !== undefined)
    throw new ProviderConfigurationError({ provider: id, message: `Google Vertex ${label} does not support API keys` })
  const {
    accessToken: _accessToken,
    auth: _auth,
    baseURL,
    location: inputLocation,
    project: inputProject,
    ...rest
  } = input
  const resolvedLocation = location(inputLocation)
  const resolvedProject = project(inputProject)
  return route.with({
    ...rest,
    endpoint: { baseURL: baseURL ?? url(requireProject(resolvedProject), resolvedLocation) },
    auth: oauth(input, resolvedProject),
  })
}

export const oauthSettings = <Options>(
  label: string,
  {
    accessToken,
    apiKey,
    baseURL,
    body,
    headers,
    location,
    project,
    ...providerOptions
  }: ProviderPackage.Settings &
    Options & {
      readonly accessToken?: string
      readonly apiKey?: never
      readonly baseURL?: string
      readonly location?: string
      readonly project?: string
    },
) => {
  if (apiKey !== undefined)
    throw new ProviderConfigurationError({ provider: id, message: `Google Vertex ${label} does not support API keys` })
  return {
    accessToken,
    baseURL,
    headers,
    http: body === undefined ? undefined : { body },
    location,
    project,
    providerOptions,
  }
}

export * as GoogleVertexShared from "./google-vertex-shared.js"
