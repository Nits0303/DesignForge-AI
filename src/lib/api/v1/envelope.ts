import { NextResponse } from "next/server";

export type V1ErrorBody = {
  success: false;
  error: { code: string; message: string };
  requestId: string;
  timestamp: string;
};

export type V1OkBody<T> = {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
};

export function v1Headers(requestId: string, extra?: Record<string, string>) {
  return {
    "X-Request-ID": requestId,
    "API-Version": "v1",
    ...extra,
  };
}

export function v1Json<T>(
  body: V1OkBody<T> | V1ErrorBody,
  status: number,
  requestId: string,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json(body, { status, headers: v1Headers(requestId, extraHeaders) });
}

export function nowIso() {
  return new Date().toISOString();
}

export function v1Success<T>(data: T, requestId: string, status = 200, extraHeaders?: Record<string, string>) {
  const body: V1OkBody<T> = {
    success: true,
    data,
    requestId,
    timestamp: nowIso(),
  };
  return NextResponse.json(body, { status, headers: v1Headers(requestId, extraHeaders) });
}

export function v1Error(
  code: string,
  message: string,
  requestId: string,
  status: number,
  extraHeaders?: Record<string, string>
) {
  const body: V1ErrorBody = {
    success: false,
    error: { code, message },
    requestId,
    timestamp: nowIso(),
  };
  return NextResponse.json(body, { status, headers: v1Headers(requestId, extraHeaders) });
}
