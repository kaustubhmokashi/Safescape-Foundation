window.SAFESCAPE_SITE_DATA = {
  pets: [
    {
      slug: "kia",
      name: "Kia",
      gender: "Female",
      breed: "Golden Retriever",
      age: "2 years",
      status: "Up for adoption",
      description:
        "Open to outstation adoptions within a reasonable driving distance from Bangalore. Kia is here to win hearts. She was given up by her family for reasons that had nothing to do with her. She is a goofy retriever girl, affectionate, and wins people over instantly. Kia is around 3 years old, vaccinated, neutered, and great with humans and other dogs."
    },
    {
      slug: "roadie",
      name: "Roadie",
      gender: "Male",
      breed: "GSD Cross",
      age: "5 years",
      status: "Up for adoption",
      description:
        "Open to outstation, estate, and farm adoptions where the family stays. Roadie was abandoned near an isolated road with no food or water for two days in heavy rain. He is a gentle, affectionate boy who still waited by the gate for his family. Vaccinated and sterilised, Roadie does well with humans, loves naps, and will thrive in either an apartment or independent house with people who truly understand the heartbreak of abandonment."
    },
    {
      slug: "whisky",
      name: "Whisky",
      gender: "Female",
      breed: "German Shepherd",
      age: "5 years",
      status: "Up for adoption",
      description:
        "Whisky was rescued in devastating condition with burns, tar injuries, and an untreated old leg injury. She has recovered beautifully and remains incredibly loving. She is shy at first, then turns into a cuddlebug once she trusts you. Whisky is calm as a solo dog, playful with companions, vaccinated, sterilised, and would do well in both apartments and independent homes. A meat-based diet and supplements are mandatory."
    },
    {
      slug: "elsa",
      name: "Elsa",
      gender: "Female",
      breed: "German Shepherd",
      age: "3 years",
      status: "Up for adoption",
      description:
        "Elsa is a playful, cheerful, and very naughty girl who is around 2.5 to 3 years old, vaccinated, and spayed. She loves food, playtime, humans, and other dogs. She is best suited to an active family, ideally with an energetic playmate. Elsa needs a meat-based diet, experienced handlers for high-energy dogs, and a family willing to work on her separation anxiety with trainer support."
    },
    {
      slug: "jess",
      name: "Jess",
      gender: "Female",
      breed: "Indie",
      age: "2 years",
      status: "Looking for a forever home",
      description:
        "Jess is one of Safescape's listed indie girls looking for a forever home. Reach out through the adoption inquiry form to learn more about her temperament, daily needs, and the kind of home that would help her thrive."
    },
    {
      slug: "pebble",
      name: "Pebble",
      gender: "Male",
      breed: "Golden Retriever",
      age: "3 years",
      status: "Looking for a forever home",
      description:
        "Pebble is a handsome retriever boy who was given up by his family for reasons unrelated to him. He is friendly with humans and other dogs, full of typical retriever energy, vaccinated, sterilised, and a total cuddlebug. He should do well in an apartment or independent home, with or without another dog, once he gets a little leash guidance."
    },
    {
      slug: "leo",
      name: "Leo",
      gender: "Male",
      breed: "Labrador",
      age: "5 years",
      status: "Up for adoption",
      description:
        "Leo is a tripod lab boy who was left on the streets after his owners moved away. He recovered from severe tick infestation and poor overall condition, and today he is vaccinated, neutered, playful, affectionate, and full of typical lab joy. His missing leg does not slow him down in the slightest. Leo would do best with adopters open to a meat-based diet and plenty of affection and activity."
    },
    {
      slug: "bacchan",
      name: "Bacchan",
      gender: "Male",
      breed: "Indie",
      age: "1 year",
      status: "Looking for a forever home",
      description:
        "Bacchan is one of Safescape's currently listed buddies still waiting for the right family. Use the adoption inquiry form to ask about his personality, compatibility, and what kind of home setup would suit him best."
    },
    {
      slug: "maya",
      name: "Maya",
      gender: "Female",
      breed: "Indie",
      age: "1 year",
      status: "Looking for a forever home",
      description:
        "Maya has been waiting far too long for a home. She is a sweet, speedy, playful girl who does beautifully with humans and other dogs. Safescape describes her as a little patakha who will absolutely make you play. She would do especially well in a family with a playful companion and space to run around. Farm and estate adoptions are welcome if the family lives on site."
    }
  ],
  forms: {
    adoption: {
      title: "Apply for Adoption",
      description: "Tell Safescape about yourself and the buddy you hope to bring home.",
      submitLabel: "Submit adoption application",
      fields: [
        { name: "fullName", label: "Full name", type: "text", required: true },
        { name: "email", label: "Email address", type: "email", required: true },
        { name: "phone", label: "Phone number", type: "tel", required: true },
        { name: "city", label: "City", type: "text", required: true },
        {
          name: "petInterested",
          label: "Buddy you are interested in",
          type: "select",
          required: true,
          options: ["General inquiry", "Kia", "Roadie", "Whisky", "Elsa", "Jess", "Pebble", "Leo", "Bacchan", "Maya"]
        },
        {
          name: "homeType",
          label: "Home type",
          type: "select",
          required: true,
          options: ["Apartment", "Independent house", "Farm / estate", "Other"]
        },
        { name: "otherPets", label: "Other pets at home", type: "text", required: false },
        { name: "experience", label: "Past dog experience", type: "text", required: false },
        {
          name: "message",
          label: "Why would you be a good fit?",
          type: "textarea",
          required: true,
          fullWidth: true
        }
      ]
    },
    volunteer: {
      title: "Become a Volunteer",
      description: "Let Safescape know how you want to help and what time you can commit.",
      submitLabel: "Submit volunteer application",
      fields: [
        { name: "fullName", label: "Full name", type: "text", required: true },
        { name: "email", label: "Email address", type: "email", required: true },
        { name: "phone", label: "Phone number", type: "tel", required: true },
        { name: "city", label: "City", type: "text", required: true },
        {
          name: "availability",
          label: "Availability",
          type: "select",
          required: true,
          options: ["Weekdays", "Weekends", "Flexible", "Specific dates only"]
        },
        { name: "skills", label: "Relevant skills", type: "text", required: false },
        {
          name: "message",
          label: "How would you like to help?",
          type: "textarea",
          required: true,
          fullWidth: true
        }
      ]
    },
    foster: {
      title: "Sign up as foster",
      description: "Share your home setup and the kind of foster support you can offer.",
      submitLabel: "Submit foster application",
      fields: [
        { name: "fullName", label: "Full name", type: "text", required: true },
        { name: "email", label: "Email address", type: "email", required: true },
        { name: "phone", label: "Phone number", type: "tel", required: true },
        { name: "city", label: "City", type: "text", required: true },
        {
          name: "fosterFile",
          label: "Upload a supporting file",
          type: "file",
          required: true,
          accept: ".pdf,.jpg,.jpeg,.png",
          help: "PDF, JPG, or PNG up to 10 MB."
        },
        {
          name: "homeType",
          label: "Home type",
          type: "select",
          required: true,
          options: ["Apartment", "Independent house", "Farm / estate", "Other"]
        },
        { name: "existingPets", label: "Existing pets", type: "text", required: false },
        {
          name: "duration",
          label: "How long can you foster?",
          type: "select",
          required: true,
          options: ["Under 2 weeks", "2 to 6 weeks", "2+ months", "Flexible"]
        },
        {
          name: "message",
          label: "Anything Safescape should know about your setup?",
          type: "textarea",
          required: true,
          fullWidth: true
        }
      ]
    },
    surrender: {
      title: "Application to Surrender",
      description: "Share the pet details so Safescape can review the request responsibly.",
      submitLabel: "Submit surrender application",
      fields: [
        { name: "fullName", label: "Your full name", type: "text", required: true },
        { name: "email", label: "Email address", type: "email", required: true },
        { name: "phone", label: "Phone number", type: "tel", required: true },
        { name: "city", label: "City", type: "text", required: true },
        { name: "petName", label: "Pet name", type: "text", required: true },
        { name: "petBreed", label: "Breed", type: "text", required: false },
        { name: "petAge", label: "Age", type: "text", required: false },
        {
          name: "reason",
          label: "Reason for surrender",
          type: "textarea",
          required: true,
          fullWidth: true
        },
        {
          name: "medicalNotes",
          label: "Medical or behavioural notes",
          type: "textarea",
          required: false,
          fullWidth: true
        }
      ]
    }
  }
};
