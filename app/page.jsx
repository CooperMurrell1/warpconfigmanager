"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Box, Button, Container, Field, Heading, HStack, Input,
  SimpleGrid, Spinner, Stack, Text,
} from "@chakra-ui/react";

function csrf() {
  const item = document.cookie.split("; ").find(value => value.startsWith("warp_csrf="));
  return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

function when(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function Tile({ title, children }) {
  return (
    <Box bg="gray.900" borderWidth="1px" borderColor="gray.800" rounded="xl" p={{ base: "4", md: "5" }}>
      <Text color="gray.400" fontSize="sm" mb="2">{title}</Text>
      {children}
    </Box>
  );
}

export default function Dashboard() {
  const [state, setState] = useState(null);
  const [hours, setHours] = useState("24");
  const [filename, setFilename] = useState("wg0.conf");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load service state");
      setState(data);
      if (document.activeElement?.id !== "interval-hours") {
        setHours(String(data.interval_seconds / 3600));
      }
      if (document.activeElement?.id !== "config-filename") {
        setFilename(data.config_filename || "wg0.conf");
      }
      setError("");
    } catch (error) {
      setError(error.message || "Could not load service state");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function post(url, body) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Request failed");
      setNotice(data.message || "Saved.");
      setTimeout(refresh, 500);
    } catch (error) {
      setError(error.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "X-CSRF-Token": csrf() } });
    } finally {
      window.location.assign("/login");
    }
  }

  const admin = state?.current_user_is_admin === true;
  const config = state?.config;
  const logs = (state?.logs || []).slice().reverse();
  const history = (state?.history || []).slice().reverse();

  return (
    <Box minH="100vh" bg="gray.950" color="gray.100" py={{ base: "5", md: "9" }}>
      <Container maxW="6xl">
        <HStack justify="space-between" align="start" mb="7" gap="4">
          <Box>
            <Text color="teal.300" fontSize="sm" fontWeight="bold" letterSpacing="wider">WARP TUNNEL</Text>
            <Heading size={{ base: "lg", md: "2xl" }} mt="1">Configuration manager</Heading>
            <Text color="gray.400" mt="2">Signed in as {state?.current_user || "Jellyfin user"}</Text>
          </Box>
          <Button variant="outline" onClick={logout}>Sign out</Button>
        </HStack>

        {error && <Alert.Root status="error" mb="5"><Alert.Indicator /><Alert.Title>{error}</Alert.Title></Alert.Root>}
        {notice && <Alert.Root status="success" mb="5"><Alert.Indicator /><Alert.Title>{notice}</Alert.Title></Alert.Root>}
        {state && !admin && (
          <Alert.Root status="warning" mb="5">
            <Alert.Indicator />
            <Alert.Title>A Jellyfin administrator account is required to change the schedule or config filename.</Alert.Title>
          </Alert.Root>
        )}
        {state?.pending_apply && (
          <Alert.Root status="warning" mb="5">
            <Alert.Indicator />
            <Alert.Title>
              The selected config is not active in the running VPN tunnel. Automatic activation is disabled; apply it manually in Portainer when ready.
            </Alert.Title>
          </Alert.Root>
        )}

        <SimpleGrid columns={{ base: 1, md: 3 }} gap="4" mb="4">
          <Tile title="Public IP through the active tunnel">
            <Heading size="lg" color={state?.ip?.address ? "teal.200" : "red.300"}>
              {state?.ip?.address || "Disconnected / unavailable"}
            </Heading>
            <Text color="gray.500" fontSize="sm" mt="2">
              {state?.ip?.error || ("Checked " + when(state?.ip?.checked_at))}
            </Text>
          </Tile>

          <Tile title="Update status">
            <HStack>
              <Badge colorPalette={state?.status === "failed" ? "red" : state?.status === "running" ? "yellow" : "teal"}>
                {state?.status || "Loading"}
              </Badge>
              {state?.status === "running" && <Spinner size="sm" />}
            </HStack>
            <Text color="gray.400" mt="3" fontSize="sm">Last successful generation: {when(state?.last_success_at)}</Text>
            <Text color="gray.400" fontSize="sm">Next run: {when(state?.next_run_at)}</Text>
          </Tile>

          <Tile title="Generation schedule">
            <Stack gap="3">
              <Field.Root>
                <Field.Label>Interval in hours</Field.Label>
                <Input
                  id="interval-hours"
                  type="number"
                  min="0.083"
                  max="2160"
                  step="any"
                  value={hours}
                  onChange={event => setHours(event.target.value)}
                  bg="gray.950"
                />
              </Field.Root>
              <HStack flexWrap="wrap">
                <Button
                  colorPalette="teal"
                  loading={busy}
                  disabled={!admin}
                  onClick={() => post("/api/interval", { interval_seconds: Math.round(Number(hours) * 3600) })}
                >
                  Save interval
                </Button>
                <Button
                  variant="outline"
                  loading={busy}
                  disabled={!admin}
                  onClick={() => post("/api/update", {})}
                >
                  Update now
                </Button>
              </HStack>
              <Text color="gray.500" fontSize="xs">5 minutes to 90 days. The interval is stored in SQLite.</Text>
            </Stack>
          </Tile>
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap="4" mb="4">
          <Box bg="gray.900" borderWidth="1px" borderColor="gray.800" rounded="xl" p={{ base: "4", md: "5" }}>
            <Heading size="md" mb="4">Config filename</Heading>
            <Stack gap="3">
              <Field.Root>
                <Field.Label>Managed WireGuard file</Field.Label>
                <Input
                  id="config-filename"
                  value={filename}
                  onChange={event => setFilename(event.target.value)}
                  placeholder="wg0.conf"
                  bg="gray.950"
                />
              </Field.Root>
              <Text color="gray.400" fontSize="sm">
                Defaults to wg0.conf. The selected file must already exist and contain a valid config before you can switch to it.
              </Text>
              <Alert.Root status="warning">
                <Alert.Indicator />
                <Alert.Title>
                  This changes the manager's target only. It does not change the VPN container's config path; configure that separately if needed.
                </Alert.Title>
              </Alert.Root>
              <Button
                alignSelf="start"
                colorPalette="teal"
                loading={busy}
                disabled={!admin}
                onClick={() => post("/api/config-file", { config_filename: filename })}
              >
                Save filename
              </Button>
            </Stack>
          </Box>

          <Box bg="gray.900" borderWidth="1px" borderColor="gray.800" rounded="xl" p={{ base: "4", md: "5" }}>
            <Heading size="md" mb="4">Installed config details</Heading>
            {config ? (
              <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
                {[
                  ["Interface address", config.address],
                  ["DNS", config.dns || "-"],
                  ["MTU", config.mtu],
                  ["Allowed IPs", config.allowed_ips],
                  ["Endpoint", config.endpoint],
                  ["Keepalive", config.keepalive ? config.keepalive + " seconds" : "Disabled"],
                ].map(([label, value]) => (
                  <Box key={label}>
                    <Text color="gray.500" fontSize="sm">{label}</Text>
                    <Text overflowWrap="anywhere">{String(value)}</Text>
                  </Box>
                ))}
              </SimpleGrid>
            ) : (
              <Text color="red.300">No usable config installed.</Text>
            )}
          </Box>
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap="4">
          <Box bg="gray.900" borderWidth="1px" borderColor="gray.800" rounded="xl" p="5">
            <Heading size="md" mb="4">Recent update history</Heading>
            <Stack gap="3">
              {history.length ? history.map((item, index) => (
                <Box key={index} borderBottomWidth={index === history.length - 1 ? 0 : 1} borderColor="gray.800" pb="3">
                  <HStack>
                    <Badge colorPalette={item.result === "failed" ? "red" : "teal"}>{item.result}</Badge>
                    <Text color="gray.500" fontSize="sm">{item.source} | {when(item.started_at)}</Text>
                  </HStack>
                  {item.error && <Text color="red.300" fontSize="sm" mt="1">{item.error}</Text>}
                </Box>
              )) : <Text color="gray.500">No update attempts recorded.</Text>}
            </Stack>
          </Box>

          <Box bg="gray.900" borderWidth="1px" borderColor="gray.800" rounded="xl" p="5">
            <Heading size="md" mb="4">Recent service logs</Heading>
            <Stack gap="3">
              {logs.length ? logs.map((item, index) => (
                <Box key={index} borderBottomWidth={index === logs.length - 1 ? 0 : 1} borderColor="gray.800" pb="3">
                  <HStack>
                    <Badge variant="outline">{item.level}</Badge>
                    <Text color="gray.500" fontSize="xs">{when(item.at)}</Text>
                  </HStack>
                  <Text mt="1" fontSize="sm">{item.message}</Text>
                </Box>
              )) : <Text color="gray.500">No logs yet.</Text>}
            </Stack>
          </Box>
        </SimpleGrid>

        <Text color="gray.600" fontSize="sm" mt="6">Secrets and complete WireGuard configs are never shown here.</Text>
      </Container>
    </Box>
  );
}
