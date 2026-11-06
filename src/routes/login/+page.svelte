<script lang="ts">
    import type { PageProps } from './$types';

    import { Button } from '#lib/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle } from '#lib/components/ui/card';
    import { Input } from '#lib/components/ui/input';
    import { Label } from '#lib/components/ui/label';

    let { form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · neuron404</title></svelte:head>
<div class="flex min-h-dvh items-center justify-center p-6">
    <Card class="w-full max-w-sm">
        <CardHeader><CardTitle>Sign in to neuron404</CardTitle></CardHeader>
        <CardContent>
            <form method="post" class="space-y-4">
                <div class="space-y-2">
                    <Label for="token">Access token</Label>
                    <Input
                        id="token"
                        name="token"
                        type="password"
                        autocomplete="current-password"
                        required
                        maxlength={1024}
                        aria-invalid={!!form?.error}
                        aria-describedby={form?.error ? 'login-error' : undefined}
                    />
                </div>
                {#if form?.error}<p id="login-error" role="alert" class="text-sm text-destructive">
                        {form.error}
                    </p>{/if}
                <Button type="submit" class="w-full">Sign in</Button>
            </form>
        </CardContent>
    </Card>
</div>
