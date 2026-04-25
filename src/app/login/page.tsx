import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">🏢 Sonja HQ</h1>
          <p className="mt-2 text-gray-500">Personal ops intelligence</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
