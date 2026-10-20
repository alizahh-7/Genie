"use client";
import { useEffect } from "react";
import { API } from "@/lib/api";
export default function Wake() { useEffect(() => { fetch(`${API}/health`).catch(() => {}); }, []); return null; }
