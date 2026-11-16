import { Reference } from "../components/reference";

interface ComponentPageProps {
  params: Promise<{ component: string }>;
}

export default async function ComponentPage({ params }: ComponentPageProps) {
  const { component } = await params;
  return <Reference slug={component} />;
}
