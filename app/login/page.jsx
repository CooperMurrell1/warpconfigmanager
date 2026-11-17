"use client";

import { useState } from "react";
import { Alert, Box, Button, Container, Field, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { ProfileAvatar } from "@/components/profile-avatar";

function csrf() {
  return document.cookie.split("; ").find(value => value.startsWith("warp_csrf="))?.split("=").slice(1).join("=") || "";
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": decodeURIComponent(csrf()) },
        body: JSON.stringify({ username, password }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign in failed");
      setWelcomeName(data.username || username);
      window.setTimeout(() => window.location.assign("/"), 2100);
    } catch (caught) {
      setError(caught.message || "Sign in failed");
      setPassword("");
      setBusy(false);
    }
  }

  if (welcomeName) {
    return (
      <Box minH="100vh" color="gray.100" display="grid" placeItems="center" px="4" overflow="hidden" aria-live="polite">
        <Container maxW="md">
          <Box className="welcome-card" textAlign="center" bg="rgba(15, 23, 42, 0.70)" borderWidth="1px" borderColor="rgba(103, 232, 249, 0.22)" rounded="3xl" p={{ base: "8", md: "12" }} backdropFilter="blur(24px)" boxShadow="0 28px 90px rgba(0, 0, 0, 0.42)">
            <Box display="flex" justifyContent="center"><ProfileAvatar name={welcomeName} size="24" className="welcome-avatar" /></Box>
            <Text color="cyan.300" fontSize="xs" fontWeight="900" letterSpacing="0.2em" mt="7">JELLYFIN CONNECTED</Text>
            <Heading color="gray.50" size="2xl" mt="3">Welcome, {welcomeName}</Heading>
            <Text color="gray.300" mt="3">Preparing your WARP dashboard…</Text>
            <Box className="welcome-progress" position="relative" overflow="hidden" height="1" rounded="full" bg="rgba(148, 163, 184, 0.18)" mt="8" _after={{ content: '""', position: "absolute", inset: "0 auto 0 0", width: "48%", bg: "linear-gradient(90deg, transparent, #67e8f9, transparent)" }} />
          </Box>
        </Container>
      </Box>
    );
  }

  return (
    <Box minH="100vh" color="gray.100" display="grid" placeItems="center" px="4" py="8">
      <Container maxW="md">
        <Box bg="rgba(15, 23, 42, 0.70)" borderWidth="1px" borderColor="rgba(148, 163, 184, 0.18)" rounded="3xl" p={{ base: "6", md: "9" }} backdropFilter="blur(24px)" boxShadow="0 28px 90px rgba(0, 0, 0, 0.42)">
          <Stack gap="6">
            <Box><Text color="cyan.300" fontSize="xs" fontWeight="900" letterSpacing="0.18em">MEDIA NETWORK TOOLS</Text><Heading color="gray.50" mt="2" size="xl">WARP Config Manager</Heading><Text mt="2" color="gray.300">Sign in with your Jellyfin administrator account.</Text></Box>
            {error && <Alert.Root status="error" rounded="xl" bg="rgba(127, 29, 29, 0.55)" color="red.50"><Alert.Indicator /><Alert.Title>{error}</Alert.Title></Alert.Root>}
            <form onSubmit={submit}>
              <Stack gap="4">
                <Field.Root required><Field.Label color="gray.200">Jellyfin username</Field.Label><Input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" /></Field.Root>
                <Field.Root required><Field.Label color="gray.200">Jellyfin password</Field.Label><Input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} bg="rgba(2, 6, 23, 0.68)" borderColor="rgba(148, 163, 184, 0.24)" color="gray.50" /></Field.Root>
                <Button type="submit" bg="cyan.400" color="gray.950" _hover={{ bg: "cyan.300" }} loading={busy} width="full">Sign in with Jellyfin</Button>
              </Stack>
            </form>
            <Text fontSize="sm" color="gray.400">Your password is sent to Jellyfin for authentication and is never stored by this app.</Text>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
}
