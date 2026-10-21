import { useStore } from "@/stores/store";
import axios from "axios";

export const URL = import.meta.env.VITE_API_URL;


const privateAPI = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { "Content-Type" : "application/json" },
  withCredentials: true
});

// adiciona o accessToken em cada requisição
privateAPI.interceptors.request.use(
  (config) => {
    const { accessToken } = useStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// renova o accessToken se expirar
privateAPI.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const { data } = await axios.post(`${URL}/auth/refresh`, {}, {
          withCredentials: true
        });
        const { setAccessToken } = useStore.getState()
        setAccessToken(data.accessToken)
        // useStore.getState().setAccessToken(data.accessToken)=
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return privateAPI(originalRequest);
        
      } catch (refreshError) {
        useStore.getState().setAccessToken("");
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export default privateAPI

// type Http = "post" | "get" | "patch" | "delete";
////////////// PRIVATE //////////////

// export function usePrivateAPI(
//   method: Http,
//   endpoint: string,
//   data?: Record<string, unknown>,
//   options?: import("@tanstack/react-query").UseQueryOptions<
//     { response: unknown },
//     unknown,
//     { response: unknown },
//     [Http, string, Record<string, unknown>?]
//   >
// ) {
//   const accessToken = useStore.getState().accessToken;

//   return useQuery({
//     queryKey: [method, endpoint, data],
//     queryFn: async () => {
//       if (accessToken === "") throw new Error("Without accessToken");
//       const response = await privateAPI({
//         method,
//         url: `${URL}${endpoint}`,
//         data,
//         headers: {
//           Authorization: accessToken,
//         },
//       });
//       return { response }
//     },
//   retry: 1,
//   ...options
// })
// }

////////////// PUBLIC //////////////

// export async function publicAPI(
//   method: Http,
//   endpoint: string,
//   data?: Record<string, unknown>
// ) {
//   const response = await axios({
//     method,
//     url: `${URL}${endpoint}`,
//     data,
//   });

//   return { response }
// }



