import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md px-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">🏢 Sonja HQ</h1>
          <p className="mt-2 text-gray-400">Personal ops intelligence</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
