"use client";
import { useState } from "react";
import { Alert, Box, Button, Container, Field, Heading, Input, Stack, Text } from "@chakra-ui/react";

function csrf() { return document.cookie.split("; ").find(v => v.startsWith("warp_csrf="))?.split("=").slice(1).join("=") || ""; }
export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": decodeURIComponent(csrf()) }, body: JSON.stringify({ username, password }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign in failed");
      window.location.assign("/");
    } catch (e) { setError(e.message || "Sign in failed"); setPassword(""); }
    finally { setBusy(false); }
  }
  return <Box minH="100vh" bg="gray.950" color="gray.100" display="grid" placeItems="center" px="4">
    <Container maxW="md"><Box bg="gray.900" borderWidth="1px" borderColor="gray.800" rounded="2xl" p={{ base: "6", md: "9" }} shadow="2xl">
      <Stack gap="6"><Box><Text color="teal.300" fontSize="sm" fontWeight="bold" letterSpacing="wider">MEDIA NETWORK TOOLS</Text><Heading mt="2" size="xl">WARP Config Manager</Heading><Text mt="2" color="gray.400">Sign in with a Jellyfin administrator account.</Text></Box>
        {error && <Alert.Root status="error"><Alert.Indicator /><Alert.Title>{error}</Alert.Title></Alert.Root>}
        <form onSubmit={submit}><Stack gap="4"><Field.Root required><Field.Label>Jellyfin username</Field.Label><Input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} bg="gray.950" /></Field.Root><Field.Root required><Field.Label>Jellyfin password</Field.Label><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} bg="gray.950" /></Field.Root><Button type="submit" colorPalette="teal" loading={busy} width="full">Sign in</Button></Stack></form>
        <Text fontSize="sm" color="gray.500">Your password is sent to the Jellyfin server for authentication and is not stored by this app.</Text>
      </Stack>
    </Box></Container>
  </Box>;
}
