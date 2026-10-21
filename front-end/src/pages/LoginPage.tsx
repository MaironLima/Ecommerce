import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardAction } from "../components/ui/corrections";
import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import publicAPI from "@/services/api/publicApi";
import { useStore } from "@/stores/store";
import { useMutation } from "@tanstack/react-query";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AxiosError } from "axios";
import { Spinner } from "@/components/ui/spinner";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mes, setMes] = useState(false);
  const [wait, setWait] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from ?? searchParams.get("from") ?? "/";

  function popUp(): void {
    setMes(true);
    setTimeout(() => setMes(false), 8000);
  }
    function waitTime(): void {
    setWait(true);
    setTimeout(() => setWait(false), 3000);
  }

  const {
    mutate: sendLogin,
    isPending: isLoginPending,
    isError: isLoginError,
    error: loginError,
  } = useMutation({
    mutationFn: async () => {
      const response = await publicAPI.post("/auth/login", { email, password });
      return response.data;
    },
    onSuccess: (data) => {
      const { setName, setAccessToken } = useStore.getState();
      setName(data.name);
      setAccessToken(data.accessToken);
      navigate(from);
    },
    onError: () => {
      waitTime()
      popUp();
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (wait) {
      throw new Error("Wait 3 seconds and try again");
    }
    e.preventDefault();
    sendLogin();
  };

  const handleSignin = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (wait) {
      throw new Error("Wait 3 seconds and try again");
    }
    navigate("/auth/register", { state: { from } });
  };

  const handleRecover = async (
    e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>
  ) => {
    if (wait) {
      throw new Error("Wait 3 seconds and try again");
    }
    e.preventDefault();
    navigate("/auth/recover");
  };
  const handleMainPage = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    navigate("/");
  };

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 50,
        }}
      >
        <button onClick={handleMainPage}>
          <img src="/vite.svg" alt="Logo" className="h-10" />
        </button>
      </div>

      <div
        className="fixed top-8 left-1/2 -translate-x-1/2 z-50 min-w-[350px] max-w-[90vw] w-fit"
      >
        {mes && isLoginError && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Something's going wrong.</AlertTitle>
            <AlertDescription>
              <p>
                Erro:{" "}
                {(loginError as AxiosError<{ error: string }>)?.response?.data
                  ?.error || loginError.message}
              </p>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Card className="justify-center items-center min-h-screenw-full max-w-sm">
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ex.: m@example.com"
                  onChange={(prev) => setEmail(prev.target.value)}
                  value={email}
                  required
                />
              </div>

              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                    <a
                      href="#"
                      className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                      onClick={handleRecover}
                    >
                      Forgot your password?
                    </a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="ex.: password132..."
                    onChange={(prev) => setPassword(prev.target.value)}
                    value={password}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full">
                Login {isLoginPending && <Spinner />}
              </Button>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <CardAction className="ml-auto">
            <Button variant="link" onClick={handleSignin}>
              Sign Up
            </Button>
          </CardAction>
        </CardFooter>
      </Card>
    </div>
  );
}

export default LoginPage;
