export const tengri = {
  name: "Tengri",
  description: "World models for factories. Industrial robotics, from simulation to deployment.",
  contactEmail: "general@tengri.systems",
  stages: [
    { id: "capture", title: "Capture", description: "Site geometry and equipment.", detail: "Work areas, access routes, and clearances." },
    { id: "simulate", title: "Simulate", description: "Robot tasks and motion.", detail: "Test layouts and constraints in the model." },
    { id: "deploy", title: "Deploy", description: "From simulation to the factory floor.", detail: "Evaluate on site. Update the model." },
  ],
} as const;
