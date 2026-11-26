import dgram from "node:dgram"
import net from "node:net"
import { isAllowedHost, NetworkBlockedError } from "./network-policy.js"

// A remote named pipe is SMB traffic, so only this machine's pipes pass.
const remotePipe = /^[\\/]{2}(?![.?][\\/])/

function assertSocket(args: readonly unknown[]) {
  // `net.connect` passes its already normalized `[options, callback]` as one array.
  const list: readonly unknown[] = Array.isArray(args[0]) ? args[0] : args
  const first = list[0]
  const options = typeof first === "object" && first !== null ? (first as { path?: unknown; host?: unknown }) : undefined
  const path = options ? options.path : typeof first === "string" && Number.isNaN(Number(first)) ? first : undefined
  if (typeof path === "string") {
    if (remotePipe.test(path)) throw new NetworkBlockedError(path)
    return
  }
  const host = options ? options.host : typeof list[1] === "string" ? list[1] : undefined
  if (typeof host === "string" && host !== "" && !isAllowedHost(host)) throw new NetworkBlockedError(host)
}

/** Refuses raw sockets, and with them `node:http`, `node:https`, `node:tls` and `ws`, outside this machine. */
export function installSocketPolicy() {
  const connect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    assertSocket(args)
    return Reflect.apply(connect, this, args)
  } as typeof connect

  const send = dgram.Socket.prototype.send
  dgram.Socket.prototype.send = function (this: dgram.Socket, ...args: unknown[]) {
    const host = args.slice(1).find((item) => typeof item === "string")
    if (typeof host === "string" && !isAllowedHost(host)) throw new NetworkBlockedError(host)
    return Reflect.apply(send, this, args)
  } as typeof send
  const connectUDP = dgram.Socket.prototype.connect
  dgram.Socket.prototype.connect = function (this: dgram.Socket, ...args: unknown[]) {
    const host = args[1]
    if (typeof host === "string" && !isAllowedHost(host)) throw new NetworkBlockedError(host)
    return Reflect.apply(connectUDP, this, args)
  } as typeof connectUDP
}
