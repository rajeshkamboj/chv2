"use client";

import { Container } from "@/components/layout/Container";
import { Button, EmptyState } from "@/components/ui";

export default function SearchError({ reset }: { reset: () => void }) {
  return (
    <Container size="narrow">
      <div className="ch-section">
        <EmptyState
          headingLevel="h1"
          title="Search is temporarily unavailable"
          description="Please try again in a moment. Your search and filters are saved in the address bar."
          action={<Button onClick={reset}>Try search again</Button>}
        />
      </div>
    </Container>
  );
}
