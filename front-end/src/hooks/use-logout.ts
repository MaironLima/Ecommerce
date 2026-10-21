import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import publicAPI from "@/services/api/publicApi";
import { useStore } from "@/stores/store";
import { useCartStore } from "@/stores/cartStore";

// Clears the HttpOnly refresh cookie (server), the access token, cart and cached queries.
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async () => {
    try {
      await publicAPI.post("/auth/logout");
    } finally {
      navigate("/");
      useStore.getState().clearAccesToken();
      useCartStore.getState().clearLocal();
      queryClient.clear();
    }
  };
}
