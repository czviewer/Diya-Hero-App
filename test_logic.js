const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
};

const allBranches = {
    "Branch_A": { latitude: 10.0, longitude: 10.0, radius: 200 }, // Home
    "Branch_B": { latitude: 10.05, longitude: 10.05, radius: 200 }, // Far away
    "Branch_C": { latitude: 10.001, longitude: 10.001, radius: 200 } // Very close
};

const mockLocation = {
    coords: { latitude: 10.0011, longitude: 10.0011 } // Right next to Branch_C
};

const testLogic = () => {
    const profile = { branch: "Branch_A", isTravelingEmployee: true };
    const processedBranches = {};
    Object.keys(allBranches).forEach(key => {
        processedBranches[key] = { ...allBranches[key], id: key };
    });

    let closestBranch = null;
    let minDistance = Infinity;
    let finalBranchId = profile.branch;

    Object.keys(processedBranches).forEach(bId => {
        const bData = processedBranches[bId];
        const dist = calculateDistance(
            mockLocation.coords.latitude,
            mockLocation.coords.longitude,
            bData.latitude,
            bData.longitude
        );
        const rad = Number(bData.radius) || 100;
        if (dist <= rad && dist < minDistance) {
            minDistance = dist;
            closestBranch = bData;
            finalBranchId = bId;
        }
    });

    console.log("Closest Branch Identified:", finalBranchId);
    console.log("Distance:", Math.round(minDistance), "meters");
};

testLogic();
