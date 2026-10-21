import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { AxiosError } from "axios";
import privateAPI from "@/services/api/privateApi";
import { useStore } from "@/stores/store";
import StarRating from "./StarRating";

interface Eligibility {
  canReview: boolean;
  purchased: boolean;
  review: { id: string; moderated: boolean } | null;
}

function ReviewForm({ productId }: { productId: string }) {
  const accessToken = useStore((s) => s.accessToken);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");

  const { data: eligibility } = useQuery<Eligibility>({
    queryKey: ["review-eligibility", productId],
    enabled: !!accessToken,
    queryFn: async () => (await privateAPI.get(`/product/${productId}/review/eligibility`)).data,
  });

  const submit = useMutation({
    mutationFn: async () =>
      privateAPI.post(`/product/${productId}/review`, { rating, title, comment: comment || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["review-eligibility", productId] });
    },
  });

  const submitError = (submit.error as AxiosError<{ error?: string }> | null)?.response?.data?.error;

  if (!accessToken) {
    return (
      <p className="text-sm text-muted-foreground">
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline"
          onClick={() => navigate("/auth/login", { state: { from: location.pathname } })}
        >
          Log in
        </button>{" "}
        to review this product.
      </p>
    );
  }

  if (!eligibility) return null;

  if (eligibility.review) {
    return (
      <p className="text-sm text-muted-foreground">
        {eligibility.review.moderated
          ? "You already reviewed this product. Thank you!"
          : "Thanks! Your review is awaiting moderation."}
      </p>
    );
  }

  if (!eligibility.purchased) {
    return <p className="text-sm text-muted-foreground">Only customers who bought this product can review it.</p>;
  }

  return (
    <form
      className="flex flex-col gap-3 border border-border rounded-xl p-4 bg-muted/30"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Write a review</h3>
      <StarRating value={rating} size={22} onChange={setRating} />
      <input
        className="global-input"
        placeholder="Title"
        aria-label="Review title"
        value={title}
        minLength={3}
        maxLength={64}
        required
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="global-input min-h-24 resize-y"
        placeholder="Tell other customers what you think (optional)"
        aria-label="Review comment"
        value={comment}
        maxLength={600}
        onChange={(e) => setComment(e.target.value)}
      />
      {submitError && (
        <span className="text-sm text-destructive" role="alert">
          {submitError}
        </span>
      )}
      <button
        type="submit"
        className="global-btn w-fit flex items-center gap-2 disabled:opacity-50"
        disabled={submit.isPending}
      >
        {submit.isPending && <Loader2 size={16} className="animate-spin" />} Submit review
      </button>
    </form>
  );
}

export default ReviewForm;
