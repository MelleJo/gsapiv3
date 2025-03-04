'use client';

export default function TestComponent() {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Test Component</h2>
      <p className="text-gray-700">
        Dit is een testcomponent om te controleren of componenten correct renderen.
      </p>
      <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md">
        Test Knop
      </button>
    </div>
  );
}